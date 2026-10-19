import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService } from '../attachments/storage.service';
import { AlertService } from '../common/alert.service';
import { MailService } from '../common/mail.service';
import { PrismaService } from '../common/prisma.service';
import { AuthUser } from '../auth/auth.utils';

const COOLDOWN_MS = 20_000;

/** Painel técnico: mostra, sem expor segredos, o que está ligado e o que falta ligar. */
@Injectable()
export class ConnectionsService {
  private readonly lastTest = new Map<string, number>();

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly mail: MailService, private readonly alerts: AlertService, private readonly storage: StorageService) {}

  private secretLooksWeak(value: string | undefined): boolean {
    return !value || value.length < 32 || /gere-um|gere-outro|change-?me|secret|senha/i.test(value);
  }

  async overview() {
    const started = Date.now();
    let database: { ok: boolean; latenciaMs: number | null; detalhe?: string } = { ok: false, latenciaMs: null };
    try { await this.prisma.$queryRaw`SELECT 1`; database = { ok: true, latenciaMs: Date.now() - started }; } catch (error) { database = { ok: false, latenciaMs: null, detalhe: error instanceof Error ? error.message.slice(0, 120) : 'erro' }; }

    const [latestSync, admins, withTwoFactor, writable, usage] = await Promise.all([
      this.prisma.concurso.findFirst({ orderBy: { sincronizadoEm: 'desc' }, select: { sincronizadoEm: true } }).catch(() => null),
      this.prisma.usuario.count({ where: { papel: 'admin' } }).catch(() => 0),
      this.prisma.usuario.count({ where: { papel: 'admin', totpAtivo: true } }).catch(() => 0),
      this.storage.writable(),
      this.storage.usage(),
    ]);
    const lastSync = latestSync?.sincronizadoEm ?? null;
    const syncAge = lastSync ? Math.round((Date.now() - lastSync.getTime()) / 60_000) : null;
    const provider = this.config.get<string>('PAYMENT_PROVIDER') ?? 'disabled';
    const paymentsOn = this.config.get<string>('PAYMENTS_ENABLED') === 'true' || this.config.get<string>('PLATFORM_PAYMENTS_ENABLED') === 'true';
    const coraCreds = Boolean(this.config.get<string>('CORA_CLIENT_ID')) && Boolean(this.config.get<string>('CORA_CERT_BASE64') || this.config.get<string>('CORA_CERT_PEM') || this.config.get<string>('CORA_CERT_PATH')) && Boolean(this.config.get<string>('CORA_KEY_BASE64') || this.config.get<string>('CORA_KEY_PEM') || this.config.get<string>('CORA_KEY_PATH'));
    const uploadsPath = this.storage.root();

    return {
      geradoEm: new Date(),
      banco: database,
      email: this.mail.describe(),
      pagamentos: { provedor: provider, habilitado: paymentsOn, ambiente: this.config.get<string>('CORA_ENV') ?? null, credenciais: provider === 'cora' ? coraCreds : null, avisosConfigurados: Boolean(this.config.get<string>('PAYMENT_WEBHOOK_SECRET')) },
      caixa: { ultimaAtualizacao: lastSync, idadeMinutos: syncAge, ok: syncAge !== null && syncAge <= 90 },
      alertas: { configurado: this.alerts.isConfigured(), rotulo: this.config.get<string>('ALERT_ENV_LABEL') || 'BL' },
      arquivos: { pastaOk: writable.ok, detalhe: writable.detalhe ?? null, pasta: uploadsPath, quantidade: usage.arquivos, bytes: usage.bytes, limiteMb: Math.round(this.storage.maxBytes() / 1024 / 1024), pastaPadraoDocker: uploadsPath === '/data/uploads' },
      seguranca: {
        segredosFortes: !this.secretLooksWeak(this.config.get<string>('JWT_ACCESS_SECRET')) && !this.secretLooksWeak(this.config.get<string>('JWT_REFRESH_SECRET')),
        chaveDoisFatores: Boolean(this.config.get<string>('TOTP_ENC_KEY')),
        administradores: admins, comDoisFatores: withTwoFactor,
        recibosComSegredo: Boolean(this.config.get<string>('RECEIPT_SECRET')),
      },
    };
  }

  async testEmail(to: string, user: AuthUser): Promise<{ ok: boolean; detalhe: string }> {
    const last = this.lastTest.get(user.id) ?? 0;
    const wait = COOLDOWN_MS - (Date.now() - last);
    if (wait > 0) return { ok: false, detalhe: `Aguarde ${Math.ceil(wait / 1000)} segundos para testar de novo.` };
    this.lastTest.set(user.id, Date.now());
    return this.mail.sendTest(to);
  }

  async testAlert(): Promise<{ ok: boolean; detalhe: string }> {
    if (!this.alerts.isConfigured()) return { ok: false, detalhe: 'Os alertas ainda não foram ligados: falta preencher ALERT_WEBHOOK_URL nas variáveis do servidor.' };
    const sent = await this.alerts.alert(`teste:${Date.now()}`, 'Teste de alerta do painel: se você leu isto, os alertas estão funcionando.', 0);
    return sent ? { ok: true, detalhe: 'Alerta de teste enviado. Confira o canal.' } : { ok: false, detalhe: 'O endereço de alertas respondeu com erro. Confira ALERT_WEBHOOK_URL.' };
  }
}
