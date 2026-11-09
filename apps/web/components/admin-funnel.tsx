'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, Empty, Notify, Panel, Rec, Table } from './admin-ui';

const percent = (value: number | null) => (value === null ? '—' : `${String(value).replace('.', ',')}%`);

/** Funil de conversão: da visita ao pagamento confirmado, com a taxa de cada passo. */
export function FunnelView({ notify }: { notify: Notify }) {
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<Rec | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (from) query.set('de', from);
      if (to) query.set('ate', to);
      setData(await api(`/api/v1/admin/funil${query.size ? `?${query}` : ''}`));
    } catch (error) { notifyRef.current('error', error instanceof Error ? error.message : 'Não foi possível carregar o funil.'); }
    finally { setLoading(false); }
  }, [from, to]);
  useEffect(() => { void load(); }, [load]);

  return <>
    <div className="admin-page-heading"><div><h1>Funil de conversão</h1></div></div>
    <Panel title="Período">
      <div className="admin-form-grid">
        <label className="admin-field"><span>De</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="admin-field"><span>Até</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <div className="admin-field"><span>&nbsp;</span><button className="admin-button admin-button-ghost" onClick={() => { setFrom(''); setTo(''); }}>Últimos 30 dias</button></div>
      </div>
    </Panel>
    <Panel title="Do primeiro contato ao pagamento">
      {loading && !data ? <div className="admin-loading"><span className="admin-spinner" /><p>Carregando…</p></div> : !data?.etapas?.length ? <Empty text="Sem dados no período" /> :
        <Table minWidth={720}><thead><tr><th>Etapa</th><th>Total</th><th>Sobre a etapa anterior</th><th>Sobre as visitas</th><th>Origem do número</th></tr></thead><tbody>
          {data.etapas.map((step: Rec) => <tr key={step.chave}><td><strong>{step.titulo}</strong></td><td>{step.total}</td><td>{percent(step.sobreAnterior)}</td><td>{percent(step.sobreVisitas)}</td><td>{step.origem === 'navegador' ? 'Contagem do site' : 'Banco de dados'}</td></tr>)}
        </tbody></Table>}
    </Panel>
  </>;
}
