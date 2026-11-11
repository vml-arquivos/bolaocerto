import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from './notifications.service';
import { approvalAlert, betAlert, paymentReminderText, reminderStep, settlementAlert, TIPO_LEMBRETE_PAGAMENTO, TIPO_TAREFA_EQUIPE, type TaskAlert } from './reminders';

const MAX_TASK_ALERTS_PER_RUN = 12;

/**
 * Dois avisos automáticos:
 *  - cotista que reservou e ainda não pagou recebe lembretes curtos enquanto a reserva (e o QR) ainda valem;
 *  - administradores e equipe de operação recebem no celular/PC o que está pendente em "Para fazer".
 * Cada aviso tem uma chave: a mesma chave nunca é enviada duas vezes para a mesma pessoa.
 */
@Injectable()
export class RemindersWatcher {
  private readonly logger = new Logger(RemindersWatcher.name);
  private payingBusy = false;
  private tasksBusy = false;

  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}

  private async alreadySent(tipo: string, since: Date): Promise<Set<string>> {
    const rows = await this.prisma.notificacao.findMany({ where: { tipo, criadoEm: { gte: since } }, select: { usuarioId: true, payload: true } });
    return new Set(rows.map((row) => `${row.usuarioId}|${String((row.payload as { chave?: unknown } | null)?.chave ?? '')}`));
  }

  @Cron('* * * * *')
  async remindUnpaid(): Promise<number> {
    if (this.payingBusy) return 0;
    this.payingBusy = true;
    try {
      const now = new Date();
      const shares = await this.prisma.cota.findMany({
        where: { status: 'reservada', expiraReservaEm: { gt: now }, origemVenda: 'online', bolao: { status: 'aberto' } },
        select: { id: true, compradorId: true, reservadaEm: true, expiraReservaEm: true, comprador: { select: { nome: true } } },
        take: 500,
      });
      if (!shares.length) return 0;
      const sent = await this.alreadySent(TIPO_LEMBRETE_PAGAMENTO, new Date(now.getTime() - 6 * 3_600_000));
      let created = 0;
      for (const share of shares) {
        if (!share.expiraReservaEm) continue;
        const step = reminderStep(share.reservadaEm, share.expiraReservaEm, now);
        if (!step) continue;
        const chave = `pgto:${share.id}:${step}`;
        if (sent.has(`${share.compradorId}|${chave}`)) continue;
        const text = paymentReminderText(step, share.comprador.nome.split(' ')[0] ?? '');
        await this.notifications.notify(share.compradorId, TIPO_LEMBRETE_PAGAMENTO, { ...text, link: '/minha-conta', chave, cotaId: share.id, semEmail: step === 1 });
        created += 1;
      }
      return created;
    } catch (error) {
      this.logger.error(`Lembretes de pagamento falharam: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    } finally {
      this.payingBusy = false;
    }
  }

  async collectTaskAlerts(now: Date = new Date()): Promise<TaskAlert[]> {
    const alerts: TaskAlert[] = [];
    const toBet = await this.prisma.bolao.findMany({
      where: { status: { in: ['aberto', 'fechado'] }, cotasVendidas: { gt: 0 }, concurso: { dataSorteio: { gte: new Date(now.getTime() - 3_600_000) } } },
      select: { id: true, concurso: { select: { modalidade: true, numeroConcurso: true, cutoffAt: true } }, cotas: { where: { status: 'paga' }, select: { quantidade: true } } },
      orderBy: { concurso: { cutoffAt: 'asc' } }, take: 50,
    });
    for (const pool of toBet) {
      const cotasPagas = pool.cotas.reduce((sum, cota) => sum + cota.quantidade, 0);
      if (cotasPagas > 0) alerts.push(betAlert({ id: pool.id, modalidade: pool.concurso.modalidade, numero: pool.concurso.numeroConcurso, cutoffAt: pool.concurso.cutoffAt, cotasPagas }, now));
    }
    const approvals = await this.prisma.bolao.findMany({ where: { status: 'rascunho', aprovacaoSolicitadaEm: { not: null } }, select: { id: true, aprovacaoSolicitadaEm: true }, take: 50 });
    for (const pool of approvals) if (pool.aprovacaoSolicitadaEm) alerts.push(approvalAlert({ id: pool.id, solicitadaEm: pool.aprovacaoSolicitadaEm }, now));
    const overdue = await this.prisma.bolao.findMany({ where: { status: 'registrado', concurso: { dataSorteio: { lt: new Date(now.getTime() - 12 * 3_600_000) } } }, select: { id: true, concurso: { select: { modalidade: true, numeroConcurso: true, dataSorteio: true } } }, take: 50 });
    for (const pool of overdue) alerts.push(settlementAlert({ id: pool.id, modalidade: pool.concurso.modalidade, numero: pool.concurso.numeroConcurso, sorteio: pool.concurso.dataSorteio }, now));
    return alerts;
  }

  @Cron('*/10 * * * *')
  async alertStaff(): Promise<number> {
    if (this.tasksBusy) return 0;
    this.tasksBusy = true;
    try {
      const now = new Date();
      const alerts = await this.collectTaskAlerts(now);
      if (!alerts.length) return 0;
      const staff = await this.prisma.usuario.findMany({ where: { papel: { in: ['admin', 'operacao'] } }, select: { id: true, papel: true } });
      if (!staff.length) return 0;
      const sent = await this.alreadySent(TIPO_TAREFA_EQUIPE, new Date(now.getTime() - 8 * 86_400_000));
      let created = 0;
      for (const alert of alerts) {
        // Aprovação de bolão é decisão do administrador; o resto vai para toda a equipe.
        const targets = staff.filter((user) => !alert.chave.startsWith('aprovar:') || user.papel === 'admin');
        for (const user of targets) {
          if (created >= MAX_TASK_ALERTS_PER_RUN) return created;
          if (sent.has(`${user.id}|${alert.chave}`)) continue;
          await this.notifications.notify(user.id, TIPO_TAREFA_EQUIPE, { titulo: alert.titulo, mensagem: alert.mensagem, link: alert.link, chave: alert.chave, semEmail: !alert.urgente });
          created += 1;
        }
      }
      if (created) this.logger.log(`${created} aviso(s) de tarefas enviados para a equipe.`);
      return created;
    } catch (error) {
      this.logger.error(`Avisos de tarefas da equipe falharam: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    } finally {
      this.tasksBusy = false;
    }
  }
}
