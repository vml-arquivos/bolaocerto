import { randomUUID } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { escapeHtml, MailService, wrapEmailHtml } from '../common/mail.service';
import { PrismaService } from '../common/prisma.service';

export interface NotificationPayload {
  titulo?: string;
  mensagem?: string;
  link?: string;
  [key: string]: unknown;
}

export const NOTIFICATION_TITLES: Record<string, string> = {
  'cota.premiada': 'Você tem uma cota premiada!',
  'pagamento.confirmado': 'Pagamento confirmado',
  'bolao.liberado': 'Cotas liberadas',
  'bolao.apurado': 'Seu bolão foi apurado',
  'cota.recibo': 'Recibo da sua cota disponível',
  'conta.exclusao_solicitada': 'Pedido de exclusão registrado',
};

/** Texto padrão do e-mail para cada tipo de aviso. */
export function describeNotification(tipo: string, payload: NotificationPayload): { titulo: string; mensagem: string; link: string | null } {
  const titulo = payload.titulo || NOTIFICATION_TITLES[tipo] || 'Aviso do BL';
  const mensagem = payload.mensagem || 'Você tem uma novidade na sua conta.';
  const poolLink = tipo === 'bolao.apurado' && typeof payload.bolaoId === 'string' && /^[0-9a-f-]{36}$/i.test(payload.bolaoId) ? `/boloes/${payload.bolaoId}` : null;
  const link = typeof payload.link === 'string' ? payload.link : poolLink ?? (tipo === 'cota.premiada' || tipo === 'pagamento.confirmado' || tipo === 'cota.recibo' ? '/minha-conta' : null);
  return { titulo, mensagem, link };
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService, private readonly mail: MailService) {}

  /** Registra um aviso na conta da pessoa (e o e-mail é enviado pelo despachante, se houver SMTP). */
  async notify(usuarioId: string, tipo: string, payload: NotificationPayload, client: Prisma.TransactionClient | PrismaService = this.prisma) {
    return client.notificacao.create({ data: { usuarioId, canal: 'push', tipo, payload: payload as Prisma.InputJsonValue } });
  }

  async list(usuarioId: string) {
    const [items, naoLidas] = await Promise.all([
      this.prisma.notificacao.findMany({ where: { usuarioId }, orderBy: { criadoEm: 'desc' }, take: 30 }),
      this.prisma.notificacao.count({ where: { usuarioId, lidoEm: null } }),
    ]);
    return {
      naoLidas,
      items: items.map((item) => {
        const payload = (item.payload ?? {}) as NotificationPayload;
        const info = describeNotification(item.tipo, payload);
        return { id: item.id, tipo: item.tipo, titulo: info.titulo, mensagem: info.mensagem, link: info.link, lida: Boolean(item.lidoEm), criadoEm: item.criadoEm };
      }),
    };
  }

  async markRead(usuarioId: string, id: string) {
    const result = await this.prisma.notificacao.updateMany({ where: { id, usuarioId, lidoEm: null }, data: { lidoEm: new Date() } });
    if (result.count === 0) {
      const exists = await this.prisma.notificacao.findFirst({ where: { id, usuarioId }, select: { id: true } });
      if (!exists) throw new NotFoundException('Aviso não encontrado.');
    }
    return { ok: true };
  }

  async markAllRead(usuarioId: string) {
    const result = await this.prisma.notificacao.updateMany({ where: { usuarioId, lidoEm: null }, data: { lidoEm: new Date() } });
    return { ok: true, marcadas: result.count };
  }

  // ───────── Avise-me (bolões condicionais) ─────────

  private async conditionalPool(bolaoId: string) {
    const pool = await this.prisma.bolao.findUnique({ where: { id: bolaoId }, select: { id: true, premioMinimoLiberacao: true, liberadoEm: true, status: true, grupo: { select: { nome: true } } } });
    if (!pool) throw new NotFoundException('Bolão não encontrado.');
    return pool;
  }

  async interestStatus(bolaoId: string, usuarioId?: string) {
    const pool = await this.conditionalPool(bolaoId);
    const [total, mine] = await Promise.all([
      this.prisma.bolaoInteresse.count({ where: { bolaoId } }),
      usuarioId ? this.prisma.bolaoInteresse.findUnique({ where: { bolaoId_usuarioId: { bolaoId, usuarioId } }, select: { id: true } }) : Promise.resolve(null),
    ]);
    return { condicional: pool.premioMinimoLiberacao !== null, liberado: Boolean(pool.liberadoEm), inscrito: Boolean(mine), total };
  }

  async subscribe(bolaoId: string, usuarioId: string) {
    const pool = await this.conditionalPool(bolaoId);
    if (pool.premioMinimoLiberacao === null) throw new NotFoundException('Este bolão não é condicional: as cotas já estão disponíveis.');
    if (pool.liberadoEm) return { inscrito: false, mensagem: 'As cotas deste bolão já foram liberadas.' };
    await this.prisma.bolaoInteresse.upsert({ where: { bolaoId_usuarioId: { bolaoId, usuarioId } }, create: { bolaoId, usuarioId }, update: {} });
    return { inscrito: true, mensagem: 'Pronto! Vamos avisar você na sua conta (e por e-mail, quando disponível) assim que as cotas forem liberadas.' };
  }

  async unsubscribe(bolaoId: string, usuarioId: string) {
    await this.prisma.bolaoInteresse.deleteMany({ where: { bolaoId, usuarioId } });
    return { inscrito: false };
  }

  /** Avisa quem pediu para ser lembrado quando o bolão libera as cotas. Seguro para chamar mais de uma vez. */
  async notifyPoolReleased(bolaoId: string): Promise<number> {
    try {
      const pool = await this.prisma.bolao.findUnique({ where: { id: bolaoId }, select: { id: true, grupo: { select: { nome: true } }, concurso: { select: { modalidade: true, numeroConcurso: true } } } });
      if (!pool) return 0;
      const pending = await this.prisma.bolaoInteresse.findMany({ where: { bolaoId, notificadoEm: null }, select: { id: true, usuarioId: true } });
      let sent = 0;
      for (const item of pending) {
        const marked = await this.prisma.bolaoInteresse.updateMany({ where: { id: item.id, notificadoEm: null }, data: { notificadoEm: new Date() } });
        if (marked.count !== 1) continue;
        await this.notify(item.usuarioId, 'bolao.liberado', {
          titulo: 'Cotas liberadas!',
          mensagem: `O prêmio atingiu o valor do gatilho e as cotas do bolão "${pool.grupo?.nome ?? 'Bolão'}"${pool.concurso ? ` (concurso ${pool.concurso.numeroConcurso})` : ''} foram liberadas. Garanta a sua antes que acabem.`,
          link: `/boloes/${bolaoId}`,
          bolaoId,
        });
        sent += 1;
      }
      return sent;
    } catch (error) {
      this.logger.error(`Falha ao avisar interessados do bolão ${bolaoId}: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    }
  }

  // ───────── Envio por e-mail ─────────

  /** Envia por e-mail os avisos ainda não enviados. Só roda com SMTP configurado. */
  async dispatchPending(limit = 50): Promise<{ enviados: number; falhas: number }> {
    if (!this.mail.isConfigured()) return { enviados: 0, falhas: 0 };
    const pending = await this.prisma.notificacao.findMany({
      where: { enviadoEm: null, canal: 'push', tentativas: { lt: 10 }, proximaTentativaEm: { lte: new Date() }, OR: [{ leaseAte: null }, { leaseAte: { lt: new Date() } }] },
      orderBy: { criadoEm: 'asc' }, take: limit, include: { usuario: { select: { email: true, nome: true } } },
    });
    let enviados = 0;
    let falhas = 0;
    for (const item of pending) {
      const token = randomUUID();
      const claimed = await this.prisma.notificacao.updateMany({ where: { id: item.id, enviadoEm: null, tentativas: { lt: 10 }, proximaTentativaEm: { lte: new Date() }, OR: [{ leaseAte: null }, { leaseAte: { lt: new Date() } }] }, data: { leaseToken: token, leaseAte: new Date(Date.now() + 120_000), tentativas: { increment: 1 } } });
      if (claimed.count !== 1) continue;
      const info = describeNotification(item.tipo, (item.payload ?? {}) as NotificationPayload);
      const url = info.link ? `${this.mail.publicUrl()}${info.link}` : this.mail.publicUrl();
      const first = item.usuario.nome.split(' ')[0] ?? '';
      const payload = item.payload as NotificationPayload;
      const games = Array.isArray(payload.jogos) ? (payload.jogos as Array<{ ordem: number; numeros: number[] }>).map(g => `Jogo ${g.ordem}: ${g.numeros.join(' ')}`).join('\n') : '';
      const details = [games, payload.valorJogo ? `Destinado aos bilhetes: R$ ${payload.valorJogo}` : '', payload.taxaAdministracao ? `Administração: R$ ${payload.taxaAdministracao}` : ''].filter(Boolean).join('\n');
      let ok = false;
      try { ok = await this.mail.send({
        messageId: `<${item.id}@notifications.bolaolivre>`,
        to: item.usuario.email,
        subject: info.titulo,
        text: `Olá, ${first}!\n\n${info.mensagem}\n\n${details}\n\n${url}\n\nBL — Bolão Livre`,
        html: wrapEmailHtml(info.titulo, `<p>Olá, ${escapeHtml(first)}!</p><p>${escapeHtml(info.mensagem)}</p><pre>${escapeHtml(details)}</pre>`, { label: 'Abrir no BL', url }),
      }); } catch { ok = false; }
      if (ok) enviados += 1; else falhas += 1;
      await this.prisma.notificacao.updateMany({ where: { id: item.id, leaseToken: token }, data: {
        enviadoEm: ok ? new Date() : null, leaseAte: null, leaseToken: null,
        ultimoErro: ok ? null : 'SMTP não confirmou o envio; consulte logs do serviço.',
        proximaTentativaEm: new Date(Date.now() + Math.min(86_400_000, 60_000 * 2 ** (item.tentativas ?? 0))),
      } });
    }
    return { enviados, falhas };
  }
}
