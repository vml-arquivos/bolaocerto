import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../common/prisma.service';

export interface PushMessage { titulo: string; mensagem: string; link?: string | null; tag?: string }
export interface PushSubscriptionInput { endpoint: string; keys: { p256dh: string; auth: string } }

const KEY_PUBLIC = 'vapid_public';
const KEY_PRIVATE = 'vapid_private';
/** Depois de tantas falhas seguidas o aparelho é esquecido (o navegador pode se inscrever de novo). */
const MAX_FAILURES = 5;

/**
 * Avisos no celular/computador mesmo com o site fechado (Web Push, usado pelo PWA).
 * As chaves VAPID vêm das variáveis VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY; se não existirem,
 * o sistema cria um par na primeira vez e guarda no banco — não precisa configurar nada.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private keys: { publicKey: string; privateKey: string } | null = null;

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  private subject(): string {
    const explicit = this.config.get<string>('VAPID_SUBJECT')?.trim();
    if (explicit) return explicit;
    const from = this.config.get<string>('MAIL_FROM') ?? this.config.get<string>('SMTP_FROM_EMAIL') ?? '';
    const match = from.match(/<([^>]+@[^>]+)>/) ?? from.match(/([^\s<>]+@[^\s<>]+)/);
    if (match?.[1]) return `mailto:${match[1]}`;
    const site = this.config.get<string>('APP_PUBLIC_URL') ?? this.config.get<string>('WEB_ORIGIN') ?? '';
    return /^https:\/\//.test(site) ? site : 'mailto:contato@localhost.invalid';
  }

  /** Par de chaves: variáveis do servidor > banco > cria e guarda no banco. */
  async getKeys(): Promise<{ publicKey: string; privateKey: string }> {
    if (this.keys) return this.keys;
    const envPublic = this.config.get<string>('VAPID_PUBLIC_KEY')?.trim();
    const envPrivate = this.config.get<string>('VAPID_PRIVATE_KEY')?.trim();
    if (envPublic && envPrivate) return (this.keys = { publicKey: envPublic, privateKey: envPrivate });
    const read = async () => {
      const rows = await this.prisma.configuracaoSistema.findMany({ where: { chave: { in: [KEY_PUBLIC, KEY_PRIVATE] } } });
      const publicKey = rows.find((row) => row.chave === KEY_PUBLIC)?.valor;
      const privateKey = rows.find((row) => row.chave === KEY_PRIVATE)?.valor;
      return publicKey && privateKey ? { publicKey, privateKey } : null;
    };
    const stored = await read();
    if (stored) return (this.keys = stored);
    const generated = webpush.generateVAPIDKeys();
    try {
      await this.prisma.configuracaoSistema.createMany({ data: [{ chave: KEY_PUBLIC, valor: generated.publicKey }, { chave: KEY_PRIVATE, valor: generated.privateKey }], skipDuplicates: true });
    } catch (error) {
      this.logger.error(`Não consegui guardar as chaves de push: ${error instanceof Error ? error.message : String(error)}`);
    }
    // Outra instância pode ter gravado primeiro: vale a que está no banco.
    return (this.keys = (await read()) ?? generated);
  }

  async publicKey(): Promise<string> {
    return (await this.getKeys()).publicKey;
  }

  async subscribe(userId: string, input: PushSubscriptionInput, agent?: string) {
    const row = await this.prisma.pushInscricao.upsert({
      where: { endpoint: input.endpoint },
      create: { usuarioId: userId, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth, agente: agent?.slice(0, 200) },
      update: { usuarioId: userId, p256dh: input.keys.p256dh, auth: input.keys.auth, agente: agent?.slice(0, 200), falhas: 0 },
    });
    return { ok: true, id: row.id };
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushInscricao.deleteMany({ where: { usuarioId: userId, endpoint } });
    return { ok: true };
  }

  async status(userId: string) {
    const aparelhos = await this.prisma.pushInscricao.count({ where: { usuarioId: userId } });
    return { ativo: aparelhos > 0, aparelhos };
  }

  /** Quantas pessoas já aceitaram receber avisos (painel). */
  async stats() {
    const [aparelhos, pessoas] = await Promise.all([
      this.prisma.pushInscricao.count(),
      this.prisma.pushInscricao.findMany({ select: { usuarioId: true }, distinct: ['usuarioId'] }).then((rows) => rows.length),
    ]);
    return { aparelhos, pessoas };
  }

  /** Envia para todos os aparelhos da pessoa. Nunca lança. Devolve quantos aparelhos receberam. */
  async sendToUser(userId: string, message: PushMessage): Promise<number> {
    let subs: Array<{ id: string; endpoint: string; p256dh: string; auth: string; falhas: number }> = [];
    try { subs = await this.prisma.pushInscricao.findMany({ where: { usuarioId: userId }, select: { id: true, endpoint: true, p256dh: true, auth: true, falhas: true } }); } catch { return 0; }
    if (!subs.length) return 0;
    const keys = await this.getKeys();
    const payload = JSON.stringify({ titulo: message.titulo.slice(0, 120), mensagem: message.mensagem.slice(0, 300), link: message.link || '/minha-conta', tag: message.tag });
    let delivered = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { vapidDetails: { subject: this.subject(), publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 60 * 60 * 24, urgency: 'normal' });
        delivered += 1;
        await this.prisma.pushInscricao.update({ where: { id: sub.id }, data: { ultimoEnvioEm: new Date(), falhas: 0 } }).catch(() => undefined);
      } catch (error) {
        const status = (error as { statusCode?: number })?.statusCode ?? 0;
        if (status === 404 || status === 410) { await this.prisma.pushInscricao.deleteMany({ where: { id: sub.id } }).catch(() => undefined); continue; }
        if (sub.falhas + 1 >= MAX_FAILURES) await this.prisma.pushInscricao.deleteMany({ where: { id: sub.id } }).catch(() => undefined);
        else await this.prisma.pushInscricao.update({ where: { id: sub.id }, data: { falhas: { increment: 1 } } }).catch(() => undefined);
        this.logger.warn(`Push recusado (${status || 'sem resposta'}) para o aparelho ${sub.id}.`);
      }
    }
    return delivered;
  }
}
