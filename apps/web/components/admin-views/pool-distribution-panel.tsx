'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { modalityNames } from '../../lib/domain';
import { Panel, fetchAdmin, dateTime, money } from './shared';

type Overview = {
  bolao: { id: string; criadoPor: string; grupo: string; modalidade: string; numeroConcurso: number; status: string; totalCotas: number | null; cotasVendidas: number; ilimitado: boolean };
  podeEnviar: boolean;
  links: Array<{ id: string; codigo: string; caminho: string; criadoPor: string; criadoEm: string; revogadoEm: string | null; afiliadoAlvo: { nome: string; codigo: string } | null; aceites: number }>;
  afiliados: Array<{ afiliadoId: string; nome: string; codigo: string; enviadoPor: string; aceitoEm: string; removidoEm: string | null }>;
  vendas: Array<{ afiliadoId: string | null; nome: string; codigo: string | null; pagas: number; reservadas: number; valor: string }>;
  cotas: Array<{ id: string; cotista: string; quantidade: number; status: string; criadoEm: string; vendidoPor: string; codigoAfiliado: string | null }>;
};

const json = (method: string, path: string, body?: unknown) => fetchAdmin(path, { method, ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });

/** Envia o bolão da equipe por link para afiliados e mostra quem recebeu, quem vendeu e para quem. */
export function PoolDistributionPanel({ pool, onClose, onDone, notify }: { pool: Record<string, any>; onClose: () => void; onDone: () => Promise<void> | void; notify: (kind: 'success' | 'error', text: string) => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState('');
  const [affiliates, setAffiliates] = useState<Array<{ id: string; nome: string; codigoAfiliado: string }>>([]);
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const name = `${modalityNames[pool.concurso?.modalidade] ?? pool.concurso?.modalidade ?? 'Bolão'} #${pool.concurso?.numeroConcurso ?? ''}`;

  const load = useCallback(async () => {
    try { setData(await fetchAdmin(`/api/v1/admin/boloes/${pool.id}/distribuicao`)); setLoadError(''); }
    catch (error) { setLoadError(error instanceof Error ? error.message : 'Não foi possível abrir o envio.'); }
  }, [pool.id]);

  useEffect(() => {
    box.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    void load();
    fetchAdmin('/api/v1/admin/afiliados?pageSize=100&status=aprovado').then((result: any) => setAffiliates((result.items ?? []).filter((item: any) => item.statusAprovacao === 'aprovado' || !item.statusAprovacao).map((item: any) => ({ id: item.id, nome: item.usuario?.nome ?? item.nome ?? item.codigoAfiliado, codigoAfiliado: item.codigoAfiliado })))).catch(() => undefined);
  }, [load]);

  const fullUrl = (path: string) => `${window.location.origin}${path}`;
  async function copy(path: string, key: string) {
    try { await navigator.clipboard.writeText(fullUrl(path)); setCopied(key); window.setTimeout(() => setCopied(''), 2200); }
    catch { window.prompt('Copie o link:', fullUrl(path)); }
  }
  async function createLink() {
    setBusy(true);
    try {
      const link = await json('POST', `/api/v1/admin/boloes/${pool.id}/distribuicao`, targetId ? { afiliadoId: targetId } : {});
      await load(); await onDone();
      await copy(link.caminho, link.id);
      notify('success', targetId ? 'Link criado e o afiliado foi avisado. O link também foi copiado.' : 'Link criado e copiado. Envie para os afiliados.');
      setTargetId('');
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível criar o link.'); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    if (!window.confirm('Cancelar este link? Quem ainda não abriu não vai conseguir receber o bolão. Quem já recebeu continua com ele.')) return;
    try { await json('DELETE', `/api/v1/admin/boloes/${pool.id}/distribuicao/${id}`); notify('success', 'Link cancelado.'); await load(); await onDone(); }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível cancelar o link.'); }
  }
  async function removeAffiliate(item: { afiliadoId: string; nome: string }) {
    if (!window.confirm(`Tirar este bolão do painel de ${item.nome}? O que ele já vendeu continua registrado.`)) return;
    try { await json('DELETE', `/api/v1/admin/boloes/${pool.id}/distribuicao/afiliados/${item.afiliadoId}`); notify('success', 'Bolão retirado do painel do afiliado.'); await load(); await onDone(); }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível retirar.'); }
  }

  const sold = data?.bolao.cotasVendidas ?? 0;
  const activeAffiliates = data?.afiliados.filter((item) => !item.removidoEm) ?? [];
  return <div ref={box}><Panel title={`Enviar para afiliados · ${name}`} description="Gere um link e mande para os afiliados. Quem abrir o link como afiliado recebe este bolão no painel para vender. As cotas são as mesmas para todos: cada venda, de qualquer afiliado ou direta, diminui o que sobra, e quando acabar a venda encerra para todos. Cliente que abrir o link só compra a própria cota.">
    {loadError && <p className="admin-note" role="alert">{loadError}</p>}
    {!data && !loadError && <p className="admin-note">Carregando…</p>}
    {data && <>
      <p className="admin-muted">Bolão criado por <strong>{data.bolao.criadoPor}</strong> · {sold} cota(s) vendidas{data.bolao.ilimitado ? '' : ` de ${data.bolao.totalCotas ?? 0}`} · {activeAffiliates.length} afiliado(s) com o bolão no painel</p>
      {data.podeEnviar
        ? <div className="admin-form-grid" style={{ marginTop: 10 }}>
          <label className="admin-field admin-field-wide"><span>Para quem</span>
            <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
              <option value="">Link geral (qualquer afiliado aprovado que abrir)</option>
              {affiliates.map((item) => <option key={item.id} value={item.id}>Só para {item.nome} · {item.codigoAfiliado}</option>)}
            </select>
          </label>
          <div className="admin-field" style={{ alignSelf: 'end' }}><button type="button" className="admin-button admin-button-primary" disabled={busy} onClick={() => void createLink()}>{busy ? 'Criando…' : 'Criar e copiar link'}</button></div>
        </div>
        : <p className="admin-note">Só bolão aberto para venda pode ser enviado. Os links já enviados e as vendas continuam aparecendo abaixo.</p>}

      <h4 style={{ margin: '18px 0 6px' }}>Links enviados</h4>
      {data.links.length ? <div className="transfer-people">{data.links.map((link) => <div key={link.id} className="transfer-person" style={{ flexWrap: 'wrap', gap: 8 }}>
        <span><strong>{link.afiliadoAlvo ? `Só para ${link.afiliadoAlvo.nome}` : 'Link geral'}</strong> <span className="admin-muted">· enviado por {link.criadoPor} · {dateTime(link.criadoEm)} · {link.aceites} aceite(s){link.revogadoEm ? ' · cancelado' : ''}</span></span>
        {!link.revogadoEm && <span style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="admin-button admin-button-small" onClick={() => void copy(link.caminho, link.id)}>{copied === link.id ? 'Copiado' : 'Copiar link'}</button>
          <button type="button" className="admin-button admin-button-small admin-button-ghost" onClick={() => void revoke(link.id)}>Cancelar link</button>
        </span>}
      </div>)}</div> : <p className="admin-note">Nenhum link criado ainda.</p>}

      <h4 style={{ margin: '18px 0 6px' }}>Afiliados que receberam e o que cada um vendeu</h4>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Quem vendeu</th><th>Recebeu de</th><th>Pagas</th><th>Reservadas</th><th>Valor</th><th /></tr></thead><tbody>
        {data.vendas.map((row) => {
          const received = data.afiliados.find((item) => item.afiliadoId === row.afiliadoId);
          return <tr key={row.afiliadoId ?? 'direta'}>
            <td data-label="Quem vendeu"><strong>{row.nome}</strong>{row.codigo && <small> · {row.codigo}</small>}{received?.removidoEm && <small> · retirado do painel</small>}</td>
            <td data-label="Recebeu de">{received ? <>{received.enviadoPor}<small> · {dateTime(received.aceitoEm)}</small></> : <span className="admin-muted">—</span>}</td>
            <td data-label="Pagas">{row.pagas}</td><td data-label="Reservadas">{row.reservadas}</td><td data-label="Valor">{money(Number(row.valor))}</td>
            <td className="td-actions">{received && !received.removidoEm && <button type="button" className="admin-button admin-button-small admin-button-ghost" onClick={() => void removeAffiliate(received)}>Tirar do painel</button>}</td>
          </tr>;
        })}
        {!data.vendas.length && <tr><td colSpan={6} className="admin-muted">Ainda não há venda nem afiliado neste bolão.</td></tr>}
      </tbody></table></div>

      <h4 style={{ margin: '18px 0 6px' }}>Quem comprou cada cota</h4>
      {data.cotas.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Cotista</th><th>Cotas</th><th>Situação</th><th>Vendido por</th><th>Quando</th></tr></thead><tbody>
        {data.cotas.map((cota) => <tr key={cota.id}><td data-label="Cotista"><strong>{cota.cotista}</strong></td><td data-label="Cotas">{cota.quantidade}</td><td data-label="Situação">{cota.status === 'reservada' ? 'Aguardando pagamento' : 'Paga'}</td><td data-label="Vendido por">{cota.vendidoPor}{cota.codigoAfiliado && <small> · {cota.codigoAfiliado}</small>}</td><td data-label="Quando">{dateTime(cota.criadoEm)}</td></tr>)}
      </tbody></table></div> : <p className="admin-note">Nenhuma cota vendida ainda.</p>}
    </>}
    <div className="wizard-actions" style={{ marginTop: 14, display: 'flex', gap: 8 }}><button type="button" className="admin-button admin-button-ghost" onClick={onClose}>Fechar</button></div>
  </Panel></div>;
}
