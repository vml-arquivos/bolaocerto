import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

/** Etapas que só o navegador sabe (as demais saem do próprio banco). */
export const FUNNEL_EVENTS = ['visita_home', 'bolao_visto', 'cadastro_iniciado'] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

/** Dia no fuso de Brasília, como AAAA-MM-DD. */
export function brazilDay(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

const startOf = (day: string) => new Date(`${day}T00:00:00-03:00`);
const endOf = (day: string) => new Date(startOf(day).getTime() + 86_400_000);

const pct = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

@Injectable()
export class FunnelService {
  constructor(private readonly prisma: PrismaService) {}

  /** Soma 1 à contagem do dia. Só guarda o número: nenhum dado da pessoa. */
  async record(nome: FunnelEvent, now = new Date()) {
    const day = brazilDay(now);
    await this.prisma.$executeRaw`INSERT INTO contadores_funil (dia, nome, total) VALUES (${day}::date, ${nome}, 1) ON CONFLICT (dia, nome) DO UPDATE SET total = contadores_funil.total + 1`;
  }

  /** Funil do período: etapas do navegador (contadores) + etapas reais do banco (cadastro, reserva e pagamento). */
  async report(from?: string, to?: string) {
    const today = brazilDay();
    const end = /^\d{4}-\d{2}-\d{2}$/.test(to ?? '') ? to! : today;
    const start = /^\d{4}-\d{2}-\d{2}$/.test(from ?? '') ? from! : brazilDay(new Date(Date.now() - 29 * 86_400_000));
    if (start > end) throw new BadRequestException('A data inicial precisa ser antes da final.');
    const range = { gte: startOf(start), lt: endOf(end) };
    const counters = await this.prisma.contadorFunil.groupBy({ by: ['nome'], where: { dia: { gte: new Date(`${start}T00:00:00Z`), lte: new Date(`${end}T00:00:00Z`) } }, _sum: { total: true } });
    const seen = new Map(counters.map((row) => [row.nome, row._sum.total ?? 0]));
    const [signups, reserved, paid] = await Promise.all([
      this.prisma.usuario.count({ where: { papel: 'cotista', criadoEm: range } }),
      this.prisma.cota.groupBy({ by: ['compradorId'], where: { criadoEm: range } }),
      this.prisma.cota.groupBy({ by: ['compradorId'], where: { criadoEm: range, status: { in: ['paga', 'registrada', 'apurada', 'premiada'] } } }),
    ]);
    const steps = [
      { chave: 'visita_home', titulo: 'Visitas à página inicial', total: seen.get('visita_home') ?? 0, origem: 'navegador' },
      { chave: 'bolao_visto', titulo: 'Viram a página de um bolão', total: seen.get('bolao_visto') ?? 0, origem: 'navegador' },
      { chave: 'cadastro_iniciado', titulo: 'Abriram o cadastro', total: seen.get('cadastro_iniciado') ?? 0, origem: 'navegador' },
      { chave: 'cadastro_concluido', titulo: 'Cadastros concluídos', total: signups, origem: 'sistema' },
      { chave: 'reserva', titulo: 'Pessoas que reservaram cota', total: reserved.length, origem: 'sistema' },
      { chave: 'pagamento', titulo: 'Pessoas com pagamento confirmado', total: paid.length, origem: 'sistema' },
    ].map((step, index, all) => ({ ...step, sobreAnterior: index === 0 ? null : pct(step.total, all[index - 1]!.total), sobreVisitas: index === 0 ? null : pct(step.total, all[0]!.total) }));
    return { de: start, ate: end, etapas: steps, observacao: 'Visitas contam uma vez por pessoa e sessão do navegador. Cadastro, reserva e pagamento vêm do banco e incluem quem chegou por outro caminho (afiliado, indicação), por isso podem superar as etapas anteriores.' };
  }
}
