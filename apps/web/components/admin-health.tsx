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
  const special: Rec[] = pending.faixasEspeciais ?? [];
  const failedPayments: Rec[] = pending.pagamentosFalhos ?? [];
  const unnoticed: Rec[] = pending.premiosSemAviso ?? [];
  const sync = data.sincronizacaoCaixa ?? {};
  const items: Array<{ ok: boolean; title: string; text: string }> = [
    { ok: Boolean(sync.ok), title: 'Sorteios da CAIXA', text: sync.ultima ? `atualizado há ${sync.idadeMinutos} min` : 'ainda não atualizou' },
    { ok: Boolean(data.pagamentos?.habilitado), title: 'Pagamentos', text: data.pagamentos?.habilitado ? 'ligados' : 'desligados — ninguém consegue reservar' },
    { ok: Boolean(data.email?.configurado), title: 'E-mail', text: data.email?.configurado ? 'funcionando' : 'não configurado — os avisos aparecem só dentro da conta' },
    { ok: Boolean(data.alertas?.configurado), title: 'Alertas no celular', text: data.alertas?.configurado ? 'ligados' : 'desligados — peça ao suporte técnico para ligar' },
    { ok: Boolean(data.google?.configurado), title: 'Entrar com Google', text: data.google?.configurado ? 'ligado — o botão aparece no login e no cadastro' : 'desligado — o botão não aparece. Falta o GOOGLE_CLIENT_ID no ambiente' },
  ];
  return <Panel title="Está tudo funcionando?" description={data.ok ? 'Sim, tudo certo.' : 'Alguns itens pedem atenção.'} action={<button className="admin-button admin-button-small admin-button-ghost" onClick={() => void load()}>Atualizar</button>}>
    <ul className="health-list">{items.map((item) => <li key={item.title} className={item.ok ? 'is-ok' : 'is-warn'}><span aria-hidden="true">{item.ok ? '✓' : '!'}</span><div><strong>{item.title}</strong><small>{item.text}</small></div></li>)}</ul>
    {unregistered.length > 0 && <div className="admin-callout admin-callout-warning" role="alert"><strong>Bolões pagos que ainda não foram apostados</strong><p>Faça a aposta antes do sorteio e anexe o comprovante em Comprovantes.</p>
      <Table minWidth={620}><thead><tr><th>Bolão</th><th>Fecha em</th><th>Sorteio</th><th>Cotas pagas</th></tr></thead><tbody>{unregistered.map((pool) => <tr key={pool.bolaoId}><td><strong>{modalityNames[pool.modalidade] ?? pool.modalidade} #{pool.concurso}</strong><small>{pool.grupo}</small></td><td>{pool.atrasado ? <strong>vencido</strong> : dateTime(pool.cutoffAt)}</td><td>{dateTime(pool.sorteio)}</td><td>{pool.cotasPagas}</td></tr>)}</tbody></Table></div>}
    {overdue.length > 0 && <div className="admin-callout admin-callout-warning" role="alert"><strong>Resultados atrasados</strong><p>Estes bolões já foram sorteados e ainda não foram conferidos: {overdue.map((pool) => `${modalityNames[pool.modalidade] ?? pool.modalidade} #${pool.concurso}`).join(', ')}. Avise o suporte técnico.</p></div>}
    {special.length > 0 && <div className="admin-callout admin-callout-warning" role="alert"><strong>Time do Coração / Mês de Sorte para conferir</strong><p>A apuração automática considerou só as dezenas nestes bolões. Confira o time ou mês sorteado e o prêmio dessa faixa antes de repassar.</p>
      <Table minWidth={620}><thead><tr><th>Bolão</th><th>Sorteio</th><th>Motivo</th></tr></thead><tbody>{special.map((pool) => <tr key={pool.bolaoId}><td><strong>{modalityNames[pool.modalidade] ?? pool.modalidade} #{pool.concurso}</strong></td><td>{dateTime(pool.sorteio)}</td><td>{pool.motivo}</td></tr>)}</tbody></Table></div>}
    {unnoticed.length > 0 && <div className="admin-callout admin-callout-warning" role="alert"><strong>Prêmios sem aviso ao cliente</strong><p>{unnoticed.length} {unnoticed.length === 1 ? 'cota premiada ainda não recebeu' : 'cotas premiadas ainda não receberam'} o aviso de prêmio depois de mais de 2 horas. Verifique o aplicativo de avisos e o e-mail.</p></div>}
    {failedPayments.length > 0 && <div className="admin-callout" role="status"><strong>Pagamentos que falharam (últimos 3 dias)</strong><p>A cota continua reservada. Vale ajudar a pessoa a tentar de novo.</p>
      <Table minWidth={620}><thead><tr><th>Quem</th><th>Bolão</th><th>Forma</th><th>Quando</th></tr></thead><tbody>{failedPayments.map((item) => <tr key={item.pagamentoId}><td>{item.titular}</td><td>{modalityNames[item.modalidade] ?? item.modalidade} #{item.concurso}</td><td>{item.metodo}</td><td>{dateTime(item.em)}</td></tr>)}</tbody></Table></div>}
  </Panel>;
}
