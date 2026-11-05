import Link from 'next/link';
import { money } from '../lib/domain';

/** Informações de apoio do bolão, fora da primeira tela: composição do valor, modelo de operação e documentos. */
export function PoolExtraInfo({ unitPrice, ticket, fee, feePct, operation }: { unitPrice: string; ticket: number | null; fee: number | null; feePct: number | null; operation: string }) {
  return <details className="pool-extra">
    <summary>Como funciona e documentos</summary>
    <div className="pool-extra-body">
      <ul>
        <li><strong>Valor da cota</strong> {money(unitPrice)}{ticket !== null && fee !== null && <> · {money(ticket)} para os jogos do bolão e {money(fee)} de taxa de serviço{feePct !== null ? ` (${String(feePct).replace('.', ',')}%)` : ''}.</>}</li>
        <li><strong>Operação</strong> {operation === 'mandato' ? 'a BL registra a aposta por mandato, em nome dos cotistas.' : 'a aposta é registrada em lotérica parceira.'}</li>
        <li><strong>Sua participação</strong> fica vinculada à sua conta e ao comprovante da cota. Os números apostados aparecem antes da reserva.</li>
        <li><strong>Acompanhamento</strong> do status, do resultado e da premiação em <Link href="/minha-conta">Minhas cotas</Link>.</li>
      </ul>
      <nav aria-label="Documentos" className="pool-extra-links">
        <Link href="/termos">Contrato de participação</Link>
        <Link href="/privacidade">Privacidade</Link>
        <Link href="/jogo-responsavel">Jogo responsável</Link>
      </nav>
    </div>
  </details>;
}
