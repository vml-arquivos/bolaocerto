'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, dateTime, modalityNames, Panel, Rec, Table } from './admin-ui';

/** Saúde do sistema: o que precisa de atenção AGORA (apostas pagas sem registro, apuração atrasada, CAIXA parada). */
export function HealthPanel() {
  const [data, setData] = useState<Rec | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    try { setData(await api('/api/v1/operacao/saude')); setFailed(false); } catch { setFailed(true); }
  }, []);
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 120_000); return () => window.clearInterval(timer); }, [load]);

  if (failed) return <Panel title="Está tudo funcionando?" description="Não deu para consultar agora."><p className="admin-help">Recarregue a página. Se continuar, avise o suporte técnico.</p></Panel>;
  if (!data) return null;
  const pending = data.pendencias ?? {};
  const unregistered: Rec[] = pending.apostasNaoRegistradas ?? [];
  const overdue: Rec[] = pending.apuracoesAtrasadas ?? [];
  const sync = data.sincronizacaoCaixa ?? {};
  const items: Array<{ ok: boolean; title: string; text: string }> = [
    { ok: Boolean(sync.ok), title: 'Sorteios da CAIXA', text: sync.ultima ? `atualizado há ${sync.idadeMinutos} min` : 'ainda não atualizou' },
    { ok: Boolean(data.pagamentos?.habilitado), title: 'Pagamentos', text: data.pagamentos?.habilitado ? 'ligados' : 'desligados — ninguém consegue reservar' },
    { ok: Boolean(data.email?.configurado), title: 'E-mail', text: data.email?.configurado ? 'funcionando' : 'não configurado — os avisos aparecem só dentro da conta' },
    { ok: Boolean(data.alertas?.configurado), title: 'Alertas no celular', text: data.alertas?.configurado ? 'ligados' : 'desligados — peça ao suporte técnico para ligar' },
  ];
  return <Panel title="Está tudo funcionando?" description={data.ok ? 'Sim, tudo certo.' : 'Alguns itens pedem atenção.'} action={<button className="admin-button admin-button-small admin-button-ghost" onClick={() => void load()}>Atualizar</button>}>
    <ul className="health-list">{items.map((item) => <li key={item.title} className={item.ok ? 'is-ok' : 'is-warn'}><span aria-hidden="true">{item.ok ? '✓' : '!'}</span><div><strong>{item.title}</strong><small>{item.text}</small></div></li>)}</ul>
    {unregistered.length > 0 && <div className="admin-callout admin-callout-warning" role="alert"><strong>Bolões pagos que ainda não foram apostados</strong><p>Faça a aposta antes do sorteio e anexe o comprovante em Comprovantes.</p>
      <Table minWidth={620}><thead><tr><th>Bolão</th><th>Fecha em</th><th>Sorteio</th><th>Cotas pagas</th></tr></thead><tbody>{unregistered.map((pool) => <tr key={pool.bolaoId}><td><strong>{modalityNames[pool.modalidade] ?? pool.modalidade} #{pool.concurso}</strong><small>{pool.grupo}</small></td><td>{pool.atrasado ? <strong>vencido</strong> : dateTime(pool.cutoffAt)}</td><td>{dateTime(pool.sorteio)}</td><td>{pool.cotasPagas}</td></tr>)}</tbody></Table></div>}
    {overdue.length > 0 && <div className="admin-callout admin-callout-warning" role="alert"><strong>Resultados atrasados</strong><p>Estes bolões já foram sorteados e ainda não foram conferidos: {overdue.map((pool) => `${modalityNames[pool.modalidade] ?? pool.modalidade} #${pool.concurso}`).join(', ')}. Avise o suporte técnico.</p></div>}
  </Panel>;
}
