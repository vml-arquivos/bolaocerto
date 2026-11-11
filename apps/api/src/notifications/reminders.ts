import { MODALITY_NAMES } from '../reports/pdf.util';

export const TIPO_LEMBRETE_PAGAMENTO = 'pagamento.lembrete';
export const TIPO_TAREFA_EQUIPE = 'equipe.tarefa';

const MIN = 60_000;

/**
 * Lembretes para quem reservou a cota e ainda não pagou. Dois por reserva: um logo depois de abrir o pagamento
 * e um perto de vencer. Em janelas curtas (15 min) os dois cabem folgados; em janelas longas ficam sempre a 5 min
 * do começo e do fim.
 */
export function reminderStep(reservedAt: Date, expiresAt: Date, now: Date = new Date()): 1 | 2 | null {
  const total = expiresAt.getTime() - reservedAt.getTime();
  const left = expiresAt.getTime() - now.getTime();
  const elapsed = now.getTime() - reservedAt.getTime();
  if (total <= 0 || left <= 0) return null;
  const early = Math.min(5 * MIN, Math.floor(total / 3));
  const late = Math.min(5 * MIN, Math.floor(total / 4));
  if (left <= late) return 2;
  if (elapsed >= early) return 1;
  return null;
}

export function paymentReminderText(step: 1 | 2, firstName: string): { titulo: string; mensagem: string } {
  const nome = firstName.trim();
  return step === 1
    ? { titulo: 'Seu pagamento ainda não foi feito', mensagem: `${nome ? `${nome}, s` : 'S'}ua cota está reservada. Finalize o pagamento e garanta seu lugar no bolão.` }
    : { titulo: 'Última chamada', mensagem: `${nome ? `${nome}, f` : 'F'}alta pouco: sua reserva está acabando. Pague agora e não perca sua cota.` };
}

export interface PoolTaskInput { id: string; modalidade: string; numero: number; cutoffAt: Date; cotasPagas: number }
export interface TaskAlert { chave: string; titulo: string; mensagem: string; link: string; urgente: boolean }

const modalName = (key: string) => MODALITY_NAMES[key] ?? key;
const when = (date: Date) => date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Faixa de urgência de um bolão com cota paga ainda sem registro. Cada faixa avisa uma vez (o atrasado repete de 2 em 2 h). */
export function betBucket(cutoffAt: Date, now: Date = new Date()): { faixa: string; urgente: boolean } {
  const left = cutoffAt.getTime() - now.getTime();
  if (left <= 0) return { faixa: `atrasado-${Math.floor(Math.abs(left) / (2 * 60 * MIN))}`, urgente: true };
  if (left <= 2 * 60 * MIN) return { faixa: '2h', urgente: true };
  if (left <= 6 * 60 * MIN) return { faixa: '6h', urgente: false };
  if (left <= 24 * 60 * MIN) return { faixa: '24h', urgente: false };
  return { faixa: 'novo', urgente: false };
}

export function betAlert(pool: PoolTaskInput, now: Date = new Date()): TaskAlert {
  const { faixa, urgente } = betBucket(pool.cutoffAt, now);
  const nome = `${modalName(pool.modalidade)} #${pool.numero}`;
  const cotas = `${pool.cotasPagas} cota${pool.cotasPagas === 1 ? '' : 's'} paga${pool.cotasPagas === 1 ? '' : 's'}`;
  const atrasado = pool.cutoffAt.getTime() <= now.getTime();
  return {
    chave: `apostar:${pool.id}:${faixa}`,
    titulo: atrasado ? 'Aposta atrasada!' : urgente ? 'Registre a aposta agora' : 'Bolão para apostar',
    mensagem: atrasado ? `${nome} passou do prazo e ainda não foi registrado. ${cotas}.` : `${nome}: ${cotas}. Registre a aposta até ${when(pool.cutoffAt)}.`,
    link: '/admin?view=operacao',
    urgente,
  };
}

/**
 * Bolão aberto para venda sem comprovante do jogo registrado (ou sem os números definidos). A venda pode começar antes,
 * mas o registro precisa existir antes do sorteio: lembra todo dia e, perto do fim do prazo, a cada faixa de urgência.
 */
export function proofAlert(pool: PoolTaskInput & { semNumeros?: boolean }, now: Date = new Date()): TaskAlert {
  const { faixa, urgente } = betBucket(pool.cutoffAt, now);
  const nome = `${modalName(pool.modalidade)} #${pool.numero}`;
  const atrasado = pool.cutoffAt.getTime() <= now.getTime();
  const falta = pool.semNumeros ? 'Definir os números e enviar o comprovante do jogo registrado' : 'Enviar o comprovante do jogo registrado';
  const dia = faixa === 'novo' ? `novo-${Math.floor(now.getTime() / (24 * 60 * MIN))}` : faixa;
  return {
    chave: `registro:${pool.id}:${dia}`,
    titulo: atrasado ? 'Registro do jogo atrasado!' : urgente ? 'Falta registrar o jogo agora' : 'Falta o comprovante do jogo',
    mensagem: atrasado ? `${nome} passou do prazo e o jogo não foi registrado.` : `${nome} já está à venda. ${falta} até ${when(pool.cutoffAt)}.`,
    link: '/admin?view=operacao',
    urgente,
  };
}

export function approvalAlert(pool: { id: string; solicitadaEm: Date }, now: Date = new Date()): TaskAlert {
  const bloco = Math.max(0, Math.floor((now.getTime() - pool.solicitadaEm.getTime()) / (12 * 60 * MIN)));
  return { chave: `aprovar:${pool.id}:${bloco}`, titulo: 'Bolão aguardando aprovação', mensagem: 'Um afiliado pediu para abrir a venda de um bolão. Analise e libere.', link: '/admin?view=boloes', urgente: false };
}

export function settlementAlert(pool: { id: string; modalidade: string; numero: number; sorteio: Date }, now: Date = new Date()): TaskAlert {
  const bloco = Math.floor((now.getTime() - pool.sorteio.getTime()) / (6 * 60 * MIN));
  return { chave: `apurar:${pool.id}:${bloco}`, titulo: 'Apuração atrasada', mensagem: `${modalName(pool.modalidade)} #${pool.numero} já foi sorteado e ainda não foi apurado.`, link: '/admin?view=operacao', urgente: true };
}
