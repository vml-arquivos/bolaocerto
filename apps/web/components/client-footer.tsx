import Link from 'next/link';

/** Rodapé curto das telas do aplicativo do cliente: só o aviso legal e os documentos. */
export function ClientFooter() {
  return <footer className="client-footer"><p>O BL é independente da CAIXA. Participação só para maiores de 18 anos. Jogue com responsabilidade.</p>
    <nav aria-label="Documentos"><Link href="/termos">Contrato</Link><Link href="/privacidade">Privacidade</Link><Link href="/jogo-responsavel">Jogo responsável</Link></nav></footer>;
}
