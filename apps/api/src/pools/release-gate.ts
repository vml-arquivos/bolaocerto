/**
 * Bolão condicional: as cotas só são liberadas quando o prêmio estimado do concurso
 * atingir o valor de gatilho configurado (ex.: R$ 100 milhões).
 * Uma vez liberado (liberadoEm preenchido) o bolão permanece liberado, mesmo que a
 * estimativa oscile depois — quem já comprou não perde o estoque por causa disso.
 */
export interface ReleaseGateInput {
  premioMinimoLiberacao: { toString(): string } | number | string | null | undefined;
  liberadoEm?: Date | null;
  premioAtual: { toString(): string } | number | string | null | undefined;
}

export interface ReleaseGateState {
  condicional: boolean;
  liberado: boolean;
  gatilho: number | null;
  premioAtual: number | null;
  faltam: number | null;
  progressoPct: number | null;
  mensagem: string | null;
}

const toNumber = (value: ReleaseGateInput['premioAtual']): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
};

export function brl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function evaluateReleaseGate(input: ReleaseGateInput): ReleaseGateState {
  const gatilho = toNumber(input.premioMinimoLiberacao);
  if (gatilho === null || gatilho <= 0) return { condicional: false, liberado: true, gatilho: null, premioAtual: toNumber(input.premioAtual), faltam: null, progressoPct: null, mensagem: null };
  const atual = toNumber(input.premioAtual);
  const atingido = atual !== null && atual >= gatilho;
  const liberado = Boolean(input.liberadoEm) || atingido;
  const faltam = liberado ? 0 : Math.max(gatilho - (atual ?? 0), 0);
  const progressoPct = liberado ? 100 : Math.min(Math.floor(((atual ?? 0) / gatilho) * 1000) / 10, 99.9);
  const mensagem = liberado
    ? `Cotas liberadas: o prêmio estimado atingiu o gatilho de ${brl(gatilho)}.`
    : `Cotas ainda não liberadas. Este bolão abre as vendas quando o prêmio estimado atingir ${brl(gatilho)}${atual !== null ? ` (hoje: ${brl(atual)})` : ' (estimativa ainda não informada pela CAIXA)'}.`;
  return { condicional: true, liberado, gatilho, premioAtual: atual, faltam, progressoPct, mensagem };
}
