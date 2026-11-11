# Testes de ponta a ponta

Dois arquivos, os dois contra um sistema de verdade (banco, API e site no ar):

- `api-flow.test.mjs` — fluxo de negócio pela API: concurso → bolão → banco de números → comprovante → publicar → página inicial → conciliação financeira → afiliado (cadastro, aprovação, painel, comissões) → limite de acessos.
- `cora-flow.test.mjs` + `fake-cora.mjs` — compra completa pela Cora **simulada** (certificado de cliente, token, Pix, boleto, aviso de pago, aviso perdido recuperado pela conferência, comissão). Para rodar: `node e2e/fake-cora.mjs &`, subir a API com `PAYMENT_PROVIDER=cora`, `CORA_BASE_URL=localhost:8443`, `CORA_CLIENT_ID=int-teste`, `CORA_CERT_PATH`/`CORA_KEY_PATH` apontando para `e2e/.cora-certs/`, `NODE_EXTRA_CA_CERTS=e2e/.cora-certs/ca.pem`, `PAYMENT_WEBHOOK_SECRET=segredo-teste-webhook`, `PAYMENTS_ENABLED=true` e os `LEGAL_*`; depois `node --test e2e/cora-flow.test.mjs`. Os valores completos estão no job `navegacao` do CI.
- `staff-invite.test.mjs` — link de cadastro da equipe: o administrador gera o link, a pessoa se cadastra sozinha como operação ou administrador, link de uso único, cancelamento e limites de quem pode gerar. Precisa de `ADMIN_BOOTSTRAP_EMAIL` igual ao e-mail do administrador do teste.
- `boloes-origem.test.mjs` — aba Bolões com origem (equipe ou afiliado) e quem criou, janela de venda automática (fim no prazo do concurso), intervenção da BL nas cotas livres de afiliado (grupo oficial, sem comissão), links da comunidade/grupo do WhatsApp e textos oficiais de Termos e Privacidade. Precisa só da API no ar.
- `edit-bolao.test.mjs` — no painel, editar um bolão abre o formulário com concurso, datas e regras de venda, limite por pessoa, texto e jogos salvos. Precisa da API e do site no ar.
- `layout-painel.test.mjs` — nenhuma tela do painel cria barra de rolagem lateral (1024 a 1600 px), o botão de data comemorativa tem contraste nos dois temas e a tela de Concursos navega pelos próximos meses. Precisa da API e do site no ar.
- `transferencia-cotas.test.mjs` — transferir cotistas pagos para outro bolão do mesmo concurso, valor e taxa: travas, contagens, grupo, aviso, auditoria, corrida entre duas transferências e a tela do painel.
- `checkout-browser.test.mjs` — compra pelo site até a tela de pagamento (QR Code e código Pix), aviso de pago da Cora simulada e volta automática ao bolão. Precisa da API com a Cora simulada, do `fake-cora.mjs` e do site com `PLATFORM_PAYMENTS_ENABLED=true`.
- `affiliate-app.test.mjs` — app do afiliado no celular: entrada própria (/afiliado/entrar), manifesto próprio, menu de baixo, aba Cotas (comprador só com nome e inicial, sem CPF), filtros, voltar do navegador e bloqueio de cliente. Precisa da API e do site no ar.
- `browser.test.mjs` — navegação no Chromium: páginas públicas (computador e celular), as 24 telas do painel, salvar a página inicial, banco de números e as abas do painel do afiliado. Falha se aparecer erro de página, resposta 5xx, aviso de erro na tela ou barra de rolagem lateral.

## Rodar

O CI do GitHub roda tudo sozinho (job `navegacao`). Para rodar em outro ambiente (staging, por exemplo):

```bash
# fluxo pela API
E2E_API_URL=https://staging.exemplo.com.br E2E_ADMIN_EMAIL=admin@... E2E_ADMIN_PASSWORD=... node --test e2e/api-flow.test.mjs

# navegador (precisa do pacote playwright instalado globalmente: npm i -g playwright && npx playwright install chromium)
NODE_PATH=$(npm root -g) E2E_BASE_URL=https://staging.exemplo.com.br E2E_ADMIN_EMAIL=admin@... E2E_ADMIN_PASSWORD=... node --test e2e/browser.test.mjs
```

Atenção: os testes **criam dados** (um concurso, um bolão publicado, jogos no banco de números, dois afiliados). Use só em banco de teste/staging, nunca em produção. O limite geral de acessos por IP (120 por minuto) pode bloquear a navegação automática; no ambiente de teste, defina `RATE_LIMIT_PER_MINUTE=5000` na API.
