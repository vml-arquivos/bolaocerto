'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, dateTime, Notify, Panel, Rec } from './admin-ui';
import { fileSize } from '../lib/files';

type Item = { ok: boolean | null; title: string; text: string; extra?: React.ReactNode };

function StatusList({ items }: { items: Item[] }) {
  return <ul className="health-list">{items.map((item) => <li key={item.title} className={item.ok === null ? '' : item.ok ? 'is-ok' : 'is-warn'}><span aria-hidden="true">{item.ok === null ? '•' : item.ok ? '✓' : '!'}</span><div><strong>{item.title}</strong><small>{item.text}</small>{item.extra}</div></li>)}</ul>;
}

const SMTP_EXAMPLE = `SMTP_HOST=smtp.seudominio.com.br
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=contato@seudominio.com.br
SMTP_PASS=a-senha-do-e-mail
MAIL_FROM=Bolão Livre <contato@seudominio.com.br>
APP_PUBLIC_URL=https://bl.buscarr.com.br`;

/** Painel técnico em linguagem simples: o que está ligado, o que falta e botões de teste. */
export function ConnectionsView({ notify }: { notify: Notify }) {
  const [data, setData] = useState<Rec | null>(null);
  const [loading, setLoading] = useState(true);
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await api('/api/v1/admin/conexoes')); } catch (failure) { notify('error', failure instanceof Error ? failure.message : 'Não foi possível consultar.'); }
    finally { setLoading(false); }
  }, [notify]);
  useEffect(() => { void load(); }, [load]);

  async function test(path: string, key: string, body?: Rec) {
    setBusy(key); setResult(null);
    try {
      const out = await api<{ ok: boolean; detalhe: string }>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
      setResult({ ok: out.ok, text: out.detalhe });
    } catch (failure) { setResult({ ok: false, text: failure instanceof Error ? failure.message : 'Não foi possível testar.' }); }
    finally { setBusy(''); }
  }

  if (loading && !data) return <div className="admin-loading"><span className="admin-spinner" /><p>Carregando…</p></div>;
  if (!data) return null;
  const mail = data.email ?? {}; const pay = data.pagamentos ?? {}; const caixa = data.caixa ?? {}; const files = data.arquivos ?? {}; const sec = data.seguranca ?? {}; const db = data.banco ?? {};

  return <>
    <div className="admin-page-heading"><div><span className="admin-eyebrow">Conta e acesso</span><h1>Conexões</h1><p>O que está ligado no sistema e o que ainda falta. Para ligar algo, o suporte técnico preenche os dados no servidor.</p></div><div className="admin-heading-actions"><button className="admin-button" onClick={() => void load()} disabled={loading}>{loading ? 'Atualizando…' : 'Atualizar'}</button></div></div>

    <div className="admin-dashboard-grid">
      <Panel title="E-mail" description="Recuperação de senha, avisos de pagamento e recibos">
        <StatusList items={[
          { ok: Boolean(mail.configurado), title: mail.configurado ? 'Ligado' : 'Ainda não ligado', text: mail.configurado ? `Servidor ${mail.servidor}, porta ${mail.porta}${mail.seguro ? ' (seguro)' : ''}` : 'Sem isso, os avisos aparecem só dentro da conta do cliente.' },
          ...(mail.configurado ? [
            { ok: Boolean(mail.usuario && mail.temSenha), title: 'Usuário e senha', text: mail.usuario ? `${mail.usuario}${mail.temSenha ? ' · senha preenchida' : ' · senha FALTANDO'}` : 'Sem usuário (servidor aberto)' },
            { ok: Boolean(mail.remetente), title: 'Remetente', text: mail.remetente ?? 'Não definido — preencha MAIL_FROM' },
            { ok: Boolean(mail.enderecoDoSite && !String(mail.enderecoDoSite).includes('localhost')), title: 'Endereço do site nos e-mails', text: String(mail.enderecoDoSite) },
          ] : []),
        ]} />
        <div className="connections-test">
          <label className="admin-field"><span>Enviar e-mail de teste para</span><input type="email" value={to} onChange={(event) => setTo(event.target.value)} placeholder="deixe vazio para enviar para o seu e-mail" /></label>
          <div className="admin-row-actions">
            <button className="admin-button admin-button-primary" disabled={busy === 'mail' || !mail.configurado} onClick={() => void test('/api/v1/admin/conexoes/email/testar', 'mail', to.trim() ? { para: to.trim() } : {})}>{busy === 'mail' ? 'Enviando…' : 'Enviar teste'}</button>
            <button className="admin-button admin-button-ghost" onClick={() => setShowHelp((value) => !value)}>{showHelp ? 'Esconder' : 'Como ligar o e-mail'}</button>
          </div>
          {result && <p className={`form-message ${result.ok ? 'form-success' : 'form-error'}`} role="status">{result.text}</p>}
        </div>
        {showHelp && <div className="admin-callout"><strong>Como ligar</strong>
          <p>No servidor (Coolify → Environment Variables), preencha e faça o redeploy:</p>
          <pre className="connections-code">{SMTP_EXAMPLE}</pre>
          <p>Porta 587 usa <code>SMTP_SECURE=false</code>; porta 465 usa <code>true</code>. No Gmail ou Google Workspace use uma &quot;senha de app&quot;. Depois volte aqui e clique em &quot;Enviar teste&quot;.</p>
        </div>}
      </Panel>

      <Panel title="Pagamentos" description="Cobrança por Pix e boleto">
        <StatusList items={[
          { ok: Boolean(pay.habilitado), title: pay.habilitado ? 'Ligados' : 'Desligados', text: pay.habilitado ? `Serviço: ${pay.provedor}${pay.ambiente ? ` (${pay.ambiente === 'production' ? 'valendo' : 'teste'})` : ''}` : 'Ninguém consegue reservar cotas enquanto estiver desligado.' },
          ...(pay.provedor === 'cora' ? [{ ok: Boolean(pay.credenciais), title: 'Chaves da Cora', text: pay.credenciais ? 'Preenchidas' : 'Faltam chaves (CORA_CLIENT_ID, certificado e chave)' }] : []),
          { ok: Boolean(pay.avisosConfigurados), title: 'Senha dos avisos de pagamento', text: pay.avisosConfigurados ? 'Preenchida' : 'Não preenchida (recomendado preencher)' },
        ]} />
      </Panel>
    </div>

    <div className="admin-dashboard-grid admin-dashboard-grid-three">
      <Panel title="Sorteios da CAIXA" description="Resultados e concursos">
        <StatusList items={[{ ok: Boolean(caixa.ok), title: caixa.ok ? 'Atualizando normalmente' : 'Parado', text: caixa.ultimaAtualizacao ? `Última atualização: ${dateTime(caixa.ultimaAtualizacao)} (há ${caixa.idadeMinutos} min)` : 'Ainda não atualizou. Clique em "Atualizar sorteios" no Resumo.' }]} />
      </Panel>
      <Panel title="Alertas no celular" description="Aviso quando algo precisa de atenção">
        <StatusList items={[{ ok: Boolean(data.alertas?.configurado), title: data.alertas?.configurado ? 'Ligados' : 'Desligados', text: data.alertas?.configurado ? `Canal: ${data.alertas.rotulo}` : 'Peça ao suporte para preencher ALERT_WEBHOOK_URL (Slack ou Discord).' }]} />
        <button className="admin-button admin-button-small" disabled={busy === 'alert' || !data.alertas?.configurado} onClick={() => void test('/api/v1/admin/conexoes/alertas/testar', 'alert')}>{busy === 'alert' ? 'Enviando…' : 'Enviar alerta de teste'}</button>
      </Panel>
      <Panel title="Banco de dados" description="Onde tudo fica guardado">
        <StatusList items={[{ ok: Boolean(db.ok), title: db.ok ? 'Respondendo' : 'Sem resposta', text: db.ok ? `${db.latenciaMs} ms` : db.detalhe ?? 'Verifique o servidor do banco' }]} />
      </Panel>
    </div>

    <div className="admin-dashboard-grid">
      <Panel title="Arquivos enviados" description="Comprovantes e recibos">
        <StatusList items={[
          { ok: Boolean(files.pastaOk), title: files.pastaOk ? 'Pasta pronta para gravar' : 'Não consegue gravar', text: files.pastaOk ? `${files.quantidade} arquivo(s) · ${fileSize(files.bytes ?? 0)} · limite de ${files.limiteMb} MB cada` : files.detalhe ?? 'Verifique a pasta de arquivos no servidor' },
          { ok: Boolean(files.pastaOk) && !files.pastaPadraoDocker ? true : null, title: 'Onde ficam guardados', text: files.pasta ?? '—', extra: files.pastaPadraoDocker ? <small>Confirme que esta pasta é um volume persistente no servidor; senão os arquivos somem a cada deploy. O backup diário já copia os arquivos.</small> : undefined },
        ]} />
      </Panel>
      <Panel title="Segurança" description="Proteção das contas e do painel">
        <StatusList items={[
          { ok: Boolean(sec.segredosFortes), title: 'Senhas de sessão (JWT)', text: sec.segredosFortes ? 'Fortes' : 'Fracas ou de exemplo — troque por textos longos e aleatórios' },
          { ok: Boolean(sec.chaveDoisFatores), title: 'Chave do 2FA', text: sec.chaveDoisFatores ? 'Preenchida (TOTP_ENC_KEY)' : 'Não preenchida: preencha TOTP_ENC_KEY antes de ligar o 2FA' },
          { ok: sec.administradores > 0 && sec.comDoisFatores >= sec.administradores, title: 'Administradores com 2FA', text: `${sec.comDoisFatores ?? 0} de ${sec.administradores ?? 0}` },
          { ok: Boolean(sec.recibosComSegredo), title: 'Selo dos recibos (RECEIPT_SECRET)', text: sec.recibosComSegredo ? 'Preenchido' : 'Não preenchido' },
        ]} />
      </Panel>
    </div>
  </>;
}
