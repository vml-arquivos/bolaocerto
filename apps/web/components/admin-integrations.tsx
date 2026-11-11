'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, dateTime, Notify, Panel, Rec } from './admin-ui';
import { CaixaDiagnosticsPanel, PaymentSettingsPanel } from './admin-finance-tools';
import { useIsSuperAdmin } from './staff-gate';

const MODES = [
  ['auto', 'Automática', 'A nota sai sozinha assim que o pagamento é confirmado. O cliente recebe um aviso e o PDF por e-mail.'],
  ['manual', 'Manual', 'Nada sai sozinho: no Financeiro você emite cada nota pelo botão ou registra uma nota feita fora do sistema.'],
  ['off', 'Desligada', 'Nenhuma nota é emitida.'],
] as const;

function Heading({ title, hint }: { title: string; hint: string }) {
  return <div className="admin-page-heading"><div><h1>{title}</h1><p className="integration-hint">{hint}</p></div></div>;
}

/** Linha de estado: bolinha verde/amarela, título e detalhe. */
function Row({ ok, title, text }: { ok: boolean | null; title: string; text: React.ReactNode }) {
  return <li className={ok === null ? '' : ok ? 'is-ok' : 'is-warn'}><span aria-hidden="true">{ok === null ? '•' : ok ? '✓' : '!'}</span><div><strong>{title}</strong><small>{text}</small></div></li>;
}

/** Administração → Integrações → Nota fiscal: tudo o que configura a emissão. O Financeiro só acompanha as notas. */
export function NfseIntegrationView({ notify }: { notify: Notify }) {
  const superAdmin = useIsSuperAdmin();
  const [settings, setSettings] = useState<Rec | null>(null);
  const [busy, setBusy] = useState('');
  const [diagnostic, setDiagnostic] = useState<Rec | null>(null);

  const load = useCallback(async () => {
    try { setSettings(await api('/api/v1/admin/nfse/configuracao')); }
    catch (failure) { notify('error', failure instanceof Error ? failure.message : 'Falha ao carregar a configuração.'); }
  }, [notify]);
  useEffect(() => { void load(); }, [load]);

  async function changeMode(modo: 'auto' | 'manual' | 'off') {
    setBusy('modo');
    try {
      await api('/api/v1/admin/nfse/modo', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ modo }) });
      notify('success', modo === 'auto' ? 'Emissão automática ligada. As próximas vendas já saem com nota sozinhas.' : modo === 'manual' ? 'Emissão manual. Nenhuma nota sai sozinha.' : 'Emissão de notas desligada.');
      await load();
    } catch (failure) { notify('error', failure instanceof Error ? failure.message : 'Não foi possível mudar a emissão.'); }
    finally { setBusy(''); }
  }
  async function check() {
    setBusy('diag');
    try { setDiagnostic(await api('/api/v1/admin/nfse/diagnostico')); }
    catch (failure) { notify('error', failure instanceof Error ? failure.message : 'Falha ao consultar o emissor.'); }
    finally { setBusy(''); }
  }
  async function registerIssuer() {
    setBusy('issuer');
    try { const result = await api('/api/v1/admin/nfse/emissor', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); notify('success', result.observacao ?? 'Emissor cadastrado.'); await load(); }
    catch (failure) { notify('error', failure instanceof Error ? failure.message : 'Não foi possível cadastrar o emissor.'); }
    finally { setBusy(''); }
  }

  if (!settings) return <><Heading title="Nota fiscal" hint="Como a nota de serviço é emitida e entregue ao cliente." /><div className="admin-spinner" aria-label="Carregando" /></>;
  const focus = settings.provedor === 'focus';
  const production = ['production', 'producao'].includes(settings.ambiente);
  const missing: string[] = settings.faltando ?? [];
  const hook = `${settings.enderecoDoSite ?? (typeof window !== 'undefined' ? window.location.origin : '')}/api/v1/webhooks/focus-nfe`;
  const copy = (text: string) => void navigator.clipboard?.writeText(text).then(() => notify('success', 'Copiado.'), () => notify('error', 'Não consegui copiar. Selecione e copie à mão.'));

  return <>
    <Heading title="Nota fiscal" hint="Como a nota de serviço é emitida e entregue ao cliente. As notas em si ficam em Financeiro." />

    <Panel title="Como emitir as notas" description="Vale para as próximas vendas confirmadas.">
      <div className="invoice-mode" role="radiogroup" aria-label="Como emitir as notas">
        {MODES.map(([value, title, text]) => <button key={value} type="button" role="radio" aria-checked={settings.modo === value} className={`invoice-mode-option${settings.modo === value ? ' is-active' : ''}`} disabled={!superAdmin || Boolean(busy)} onClick={() => settings.modo !== value && void changeMode(value)}><strong>{title}</strong><small>{text}</small></button>)}
      </div>
      {settings.modo === 'auto' && <p className="admin-note" role="status">Automática ligada{settings.automaticaDesde ? ` desde ${dateTime(settings.automaticaDesde)}` : ''}. Vendas anteriores a essa data não saem sozinhas; em Financeiro use &quot;Emitir as pendentes agora&quot; se quiser incluí-las.</p>}
      {settings.modoDoPainel === false && <p className="admin-note">Hoje vale o que está configurado no servidor (NFSE_MODE). Ao escolher aqui, passa a valer a escolha do painel.</p>}
      {!superAdmin && <p className="admin-note">Só o administrador principal pode mudar essa opção.</p>}
    </Panel>

    <div className="admin-dashboard-grid">
      <Panel title="Emissor" action={<div className="admin-row-actions">
        {superAdmin && <button className="admin-button" disabled={Boolean(busy)} onClick={() => void check()}>{busy === 'diag' ? 'Consultando…' : focus ? 'Conferir configuração' : 'Verificar na Cora'}</button>}
        {superAdmin && !focus && <button className="admin-button" disabled={Boolean(busy) || settings.modo === 'off'} onClick={() => void registerIssuer()}>{busy === 'issuer' ? 'Ligando…' : 'Cadastrar emissor'}</button>}
      </div>}>
        <ul className="health-list">
          <Row ok={settings.pronto || settings.modo === 'off' ? true : false} title={focus ? 'Focus NFe' : 'Cora'} text={`${production ? 'Produção (notas valem de verdade)' : 'Teste (homologação, as notas não valem)'}${settings.pronto ? '' : focus ? ` · falta: ${missing.join(', ') || 'dados do emissor'}` : ' · faltam NFSE_ISS_PCT e NFSE_SERVICE_CODE'}`} />
          {!focus && <Row ok={Boolean(settings.aliquotaIssPct)} title="Alíquota do ISS" text={settings.aliquotaIssPct ? `${settings.aliquotaIssPct}%` : 'Não definida (NFSE_ISS_PCT)'} />}
          {!focus && <Row ok={Boolean(settings.codigoServico)} title="Código de serviço" text={settings.codigoServico ?? 'Não definido (NFSE_SERVICE_CODE)'} />}
          {!focus && <Row ok={Boolean(settings.emissorConfigurado)} title="Inscrição municipal" text={settings.emissorConfigurado ? 'Cadastrada no servidor' : 'Falta NFSE_MUNICIPAL_REGISTER'} />}
        </ul>
        {focus && <p className="admin-note">Se a Focus recusar dizendo que a empresa não está autorizada a emitir, confirme com a Focus se a opção <strong>NFSe Nacional</strong> da empresa precisa estar marcada. Empresas do Simples Nacional passam a emitir pelo Emissor Nacional desde 1º/11/2026 (Resolução CGSN 191/2026); o Distrito Federal só aceita o padrão nacional desde 1º/10/2026.</p>}
        {diagnostic && focus && <p className={`form-message ${diagnostic.disponivel ? 'form-success' : 'form-error'}`} role="status">{diagnostic.disponivel ? 'Pronto para emitir.' : `Ainda não dá para emitir. Falta: ${(diagnostic.faltando ?? []).join(', ')}`}</p>}
        {diagnostic && !focus && <p className={`form-message ${diagnostic.disponivel ? 'form-success' : 'form-error'}`} role="status">{diagnostic.disponivel ? 'Cidade e empresa habilitadas na Cora.' : 'Cidade ou empresa ainda não habilitadas na Cora.'}</p>}
      </Panel>

      <Panel title="Entrega ao cliente">
        <ul className="health-list">
          <Row ok={Boolean(settings.emailAoCliente)} title="Nota por e-mail" text={settings.emailAoCliente ? 'Ligado: o PDF vai para o e-mail cadastrado' : 'Desligado: falta SMTP_HOST (e SMTP_USER, SMTP_PASS, MAIL_FROM) no servidor. Veja a aba Conexões.'} />
          <Row ok={null} title="Minha conta" text="O cliente também baixa a nota em Minha conta, na compra." />
        </ul>
      </Panel>
    </div>

    {focus && <Panel title="Aviso automático da Focus (webhook)" description="Opcional. Sem ele a nota atualiza sozinha a cada minuto; com ele, na hora em que o fisco autoriza.">
      <div className="integration-copy"><span>Endereço</span><code>{hook}</code><button type="button" className="admin-button admin-button-small" onClick={() => copy(hook)}>Copiar</button></div>
      <ol className="integration-steps">
        <li>Na Focus NFe: <strong>Painel API → Webhooks → Adicionar webhook</strong>.</li>
        <li>Empresa: a sua, no ambiente <strong>Produção</strong>. Evento: <strong>NFSe</strong> (padrão) enquanto a empresa estiver sem &quot;Ambiente da NFSe Nacional&quot; marcado; use <strong>NFSe Nacional</strong> só se essa opção for marcada. URL: o endereço acima.</li>
        <li>Para proteger com senha: em &quot;Header de Autorização&quot; escreva <code>X-Focus-Segredo</code> e em &quot;Chave de Autorização&quot; uma senha inventada por você. Coloque a mesma senha no servidor em <code>NFSE_FOCUS_WEBHOOK_SECRET</code>. É opcional: o aviso só manda o sistema consultar a Focus, então não dá para forjar uma nota.</li>
      </ol>
    </Panel>}
  </>;
}

export function PaymentsIntegrationView({ notify }: { notify: Notify }) {
  return <><Heading title="Pagamentos" hint="Cobrança da Cora e do cartão, avisos de pagamento e conferência." /><PaymentSettingsPanel notify={notify} /></>;
}

export function CaixaIntegrationView() {
  return <><Heading title="Sorteios da CAIXA" hint="Teste de conexão com os resultados oficiais." /><CaixaDiagnosticsPanel /></>;
}
