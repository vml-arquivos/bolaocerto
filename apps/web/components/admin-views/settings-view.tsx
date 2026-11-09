'use client';

import { useState } from 'react';
import { SectionHeading, Panel } from './shared';
import type { AdminCtx } from './shared';

export function SettingsView({ ctx }: { ctx: AdminCtx }) {
  const { execute } = ctx;
  const [reserveMinutes, setReserveMinutes] = useState('15');
  const [commission, setCommission] = useState('10');
  return <><SectionHeading title="Configurações" /><div className="admin-settings-grid"><Panel title="Reserva e comissão"><div className="admin-form-grid"><label className="admin-field"><span>Prazo de reserva (minutos)</span><input type="number" min="1" max="60" value={reserveMinutes} onChange={(event) => setReserveMinutes(event.target.value)} /></label><label className="admin-field"><span>Comissão padrão (%)</span><input type="number" min="0" max="100" step="0.01" value={commission} onChange={(event) => setCommission(event.target.value)} /></label></div><button className="admin-button admin-button-primary" onClick={() => execute('/api/v1/admin/configuracoes', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prazoReservaMinutos: Number(reserveMinutes), comissaoPadraoPct: Number(commission) }) }, 'Configuração salva.')}>Salvar</button></Panel><Panel title="Pagamentos"><div className="admin-callout"><strong>Dados da Cora</strong><p>Senhas e chaves da Cora ficam guardadas no servidor e não aparecem aqui.</p></div></Panel></div></>;
}
