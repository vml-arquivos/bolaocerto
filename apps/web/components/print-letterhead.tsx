'use client';
import type { ReactNode } from 'react';

/* Papel timbrado na impressão (mesma identidade dos PDFs): Bolão Livre e SORTE TECH no topo, empresa no rodapé. Só aparece ao imprimir. */
const COMPANY = 'SORTE TECH SERVIÇOS DIGITAIS LTDA · CNPJ 65.265.592/0001-19';
const ADDRESS = 'Setor Guará II/Polo de Modas, QE 40, Rua 20, Lote 23, Guará, Brasília/DF, CEP 71.070-520';

export function PrintArea({ children }: { children: ReactNode }) {
  return <div className="print-area">
    <header className="print-letterhead" aria-hidden="true">
      <img src="/brand/bl-logo-documento.png" alt="" className="print-logo-bl" />
      <span className="print-logo-st"><small>UMA PLATAFORMA</small><img src="/brand/sorte-tech-logo.png" alt="" /></span>
    </header>
    {children}
    <footer className="print-letterfoot" aria-hidden="true"><strong>{COMPANY}</strong><span>{ADDRESS}</span></footer>
  </div>;
}

/** Imprime só a área do documento (sem menu e botões do site). */
export function printDocument() {
  document.body.classList.add('print-document');
  // Partes recolhidas (histórico) saem abertas no papel e voltam como estavam depois.
  const closed = Array.from(document.querySelectorAll<HTMLDetailsElement>('.print-area details:not([open])'));
  closed.forEach((item) => { item.open = true; });
  const done = () => { document.body.classList.remove('print-document'); closed.forEach((item) => { item.open = false; }); closed.length = 0; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 60_000);
}
