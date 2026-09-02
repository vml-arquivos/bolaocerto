'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type AffiliateData = { codigoAfiliado?: string; statusAprovacao?: string; cadastrosAtribuidos?: number; participantes?: number; cotas?: number; volume?: string; comissaoPendente?: string; comissaoPaga?: string; totalComissoes?: number };
type Commission = { id: string; cotaId: string; valor: string; baseCalculo?: string | null; percentual?: string | null; status: string; criadoEm: string; repassadoEm?: string | null };

async function load(path: string) {
  const response = await fetch(path, { credentials: 'include' });
  if (response.status === 401) { window.location.href = '/login?next=/afiliado'; throw new Error('Sessão expirada.'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Não foi possível carregar sua área de afiliado.');
  return data;
}

function money(value: unknown) { return Number(value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function date(value: unknown) { const parsed = new Date(String(value)); return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('pt-BR'); }

export function AffiliateDashboard() {
  const [data, setData] = useState<AffiliateData | null>(null);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([load('/api/v1/afiliados/me/dashboard'), load('/api/v1/afiliados/me/comissoes')]).then(([dashboard, rows]) => { setData(dashboard); setCommissions(rows); }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar.'));
  }, []);

  const referralUrl = data?.codigoAfiliado ? `${window.location.origin}/r/${data.codigoAfiliado}` : '';
  async function copyLink() { if (!referralUrl) return; await navigator.clipboard.writeText(referralUrl); setCopied(true); window.setTimeout(() => setCopied(false), 2200); }

  if (error) return <div className="affiliate-error"><strong>Acesso de afiliado indisponível</strong><p>{error}</p><Link className="button button-primary" href="/">Voltar à vitrine</Link></div>;
  if (!data) return <div className="affiliate-loading">Carregando sua operação…</div>;

  return <div className="affiliate-page"><div className="affiliate-heading"><div><span className="overline">Área do afiliado</span><h1>Seu crescimento, com clareza.</h1><p>Compartilhe seu link, acompanhe as cotas atribuídas e veja cada comissão confirmada.</p></div><span className={`affiliate-status ${data.statusAprovacao}`}>{data.statusAprovacao}</span></div><section className="affiliate-link-card"><div><span className="overline">Seu link de indicação</span><strong>{referralUrl}</strong><small>A origem é registrada server-side e a comissão só nasce após pagamento confirmado.</small></div><button className="button button-primary" onClick={copyLink}>{copied ? 'Link copiado' : 'Copiar link'}</button></section><div className="affiliate-kpis"><article><span>Cadastros atribuídos</span><strong>{data.cadastrosAtribuidos ?? 0}</strong></article><article><span>Participantes</span><strong>{data.participantes ?? 0}</strong></article><article><span>Cotas atribuídas</span><strong>{data.cotas ?? 0}</strong></article><article><span>Volume confirmado</span><strong>{money(data.volume)}</strong></article><article><span>Comissão pendente</span><strong>{money(data.comissaoPendente)}</strong></article><article><span>Comissão paga</span><strong>{money(data.comissaoPaga)}</strong></article></div><section className="affiliate-table-card"><div className="affiliate-card-heading"><div><h2>Histórico de comissões</h2><p>Valores vinculados a cotas pagas e repasses registrados.</p></div><Link className="text-link" href="/#boloes">Ver vitrine</Link></div>{commissions.length ? <div className="affiliate-table-scroll"><table><thead><tr><th>Comissão</th><th>Cota</th><th>Base</th><th>Percentual</th><th>Valor</th><th>Status</th><th>Data</th></tr></thead><tbody>{commissions.map((commission) => <tr key={commission.id}><td>{commission.id.slice(0, 8)}</td><td>{commission.cotaId.slice(0, 8)}</td><td>{money(commission.baseCalculo)}</td><td>{commission.percentual ?? '—'}%</td><td><strong>{money(commission.valor)}</strong></td><td><span className="affiliate-status">{commission.status}</span></td><td>{date(commission.repassadoEm ?? commission.criadoEm)}</td></tr>)}</tbody></table></div> : <div className="affiliate-empty"><strong>Nenhuma comissão confirmada ainda.</strong><p>Quando uma cota do seu link for paga, ela aparecerá aqui com base, percentual e status de repasse.</p></div>}</section></div>;
}
