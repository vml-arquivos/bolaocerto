'use client';

import { useEffect, useState } from 'react';
import { modalityNames } from '../lib/domain';

export type DistributionPreview =
  | { valido: false }
  | { valido: true; aberto: boolean; direcionado: boolean; enviadoPor: string; bolao: { id: string; modalidade: string; numeroConcurso: number; nomeEspecial: string | null; valorCota: string; cotasIlimitadas: boolean; cotasDisponiveis: number | null; encerraEm: string } };

type State = 'loading' | 'anonymous' | 'affiliate' | 'other' | 'done' | 'error';

/** Página do link enviado pela equipe: afiliado recebe o bolão no painel; qualquer outra pessoa só compra a própria cota. */
export function DistributionAccept({ codigo, preview }: { codigo: string; preview: DistributionPreview }) {
  const [state, setState] = useState<State>('loading');
  const [message, setMessage] = useState('');
  const [already, setAlready] = useState(false);

  useEffect(() => {
    if (!preview.valido || !preview.aberto) { setState('other'); return; }
    let off = false;
    (async () => {
      try {
        const me = await fetch('/api/v1/auth/me', { credentials: 'include', cache: 'no-store' });
        if (!me.ok) { if (!off) setState('anonymous'); return; }
        const user = await me.json() as { papel?: string };
        if (user.papel !== 'afiliado') { if (!off) setState('other'); return; }
        const response = await fetch('/api/v1/afiliados/me/boloes-recebidos/aceitar', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ codigo }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) { if (!off) { setMessage(Array.isArray(data.message) ? data.message.join(' ') : data.message || 'Não foi possível receber este bolão.'); setState('error'); } return; }
        if (!off) { setAlready(Boolean(data.jaTinha)); setState('done'); }
      } catch { if (!off) { setMessage('Não foi possível conectar. Tente de novo.'); setState('error'); } }
    })();
    return () => { off = true; };
  }, [codigo, preview]);

  if (!preview.valido) return <section className="section-title"><div><span className="overline">Bolão para afiliado</span><h1>Este link não vale mais</h1><p>O link foi cancelado ou está errado. Peça um novo para a equipe do BL.</p></div></section>;

  const pool = preview.bolao;
  const title = `${modalityNames[pool.modalidade] ?? pool.modalidade}${pool.nomeEspecial ? ` · ${pool.nomeEspecial}` : ''}${pool.numeroConcurso > 0 ? ` #${pool.numeroConcurso}` : ''}`;
  const buy = <a className="button button-secondary" href={`/boloes/${pool.id}`}>Ver o bolão e comprar minha cota</a>;
  return <>
    <section className="section-title"><div><span className="overline">Bolão enviado por {preview.enviadoPor}</span><h1>{title}</h1>
      <p>Cota de R$ {pool.valorCota.replace('.', ',')} · {pool.cotasIlimitadas ? 'cotas ilimitadas' : `${pool.cotasDisponiveis ?? 0} cota(s) livres`}</p></div></section>
    {!preview.aberto && <p className="admin-note" role="status">Este bolão não está mais aberto para venda.</p>}
    {state === 'loading' && preview.aberto && <p className="muted">Conferindo o seu acesso…</p>}
    {state === 'anonymous' && <div className="group-page-actions" style={{ flexWrap: 'wrap', gap: 10 }}>
      <p style={{ width: '100%' }}>Se você é afiliado do BL, entre para colocar este bolão no seu painel e vender para os seus clientes.</p>
      <a className="button button-primary" href={`/afiliado/entrar?next=${encodeURIComponent(`/bolao-afiliado/${codigo}`)}`}>Entrar como afiliado</a>{buy}
    </div>}
    {state === 'done' && <div role="status"><p><strong>{already ? 'Este bolão já estava no seu painel.' : 'Pronto! O bolão entrou no seu painel.'}</strong> Agora você pode vender as cotas pelo seu link. As cotas são compartilhadas: quando acabarem, a venda encerra para todos.</p>
      <div className="group-page-actions" style={{ flexWrap: 'wrap', gap: 10 }}><a className="button button-primary" href="/afiliado?aba=boloes">Abrir meu painel de bolões</a></div></div>}
    {state === 'error' && <div><p className="admin-note" role="alert">{message}</p><div className="group-page-actions">{buy}</div></div>}
    {state === 'other' && <div className="group-page-actions" style={{ flexWrap: 'wrap', gap: 10 }}>
      {preview.aberto && <p style={{ width: '100%' }}>Você pode comprar a sua cota normalmente e pagar pelo próprio aplicativo.</p>}
      {preview.aberto && buy}
    </div>}
  </>;
}
