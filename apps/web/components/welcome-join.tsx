'use client';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { WhatsappJoin } from './community-link';

/** Logo depois do cadastro (?bemvindo=1): convida para o WhatsApp do grupo, a comunidade e o Instagram do BL. */
export function WelcomeJoin() {
  const params = useSearchParams();
  const [closed, setClosed] = useState(false);
  if (closed || params.get('bemvindo') !== '1') return null;
  return <section className="welcome-join" aria-label="Cadastro concluído">
    <div><strong>Cadastro concluído. Boas-vindas ao Bolão Livre!</strong><small>Se quiser, entre nos grupos para receber os bolões e resultados, e siga o BL no Instagram.</small></div>
    <WhatsappJoin groups />
    <button type="button" className="welcome-join-close" aria-label="Fechar" onClick={() => setClosed(true)}>Fechar</button>
  </section>;
}

/** Endereço depois do cadastro do cliente: marca a boas-vindas. */
export function withWelcome(url: string) {
  return `${url}${url.includes('?') ? '&' : '?'}bemvindo=1`;
}
