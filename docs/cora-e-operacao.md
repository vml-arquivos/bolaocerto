# Cora, vendas e relatórios — guia de implantação

Este guia cobre a integração com a **Cora (boleto + Pix)**, a operação de vendas e os relatórios do painel administrativo.

## 1. O que a Cora entrega (e o que não entrega)

Conforme a documentação oficial da Cora (Integração Direta):

| Recurso | Situação neste sistema |
|---|---|
| Pix por QR Code (cobrança com vencimento) | **Implementado** (valor mínimo R$ 5,00 por cobrança) |
| Boleto registrado **com Pix incluso** | **Implementado** (um único documento: pague pelo boleto ou pelo Pix) |
| Webhooks de cobrança paga/cancelada | **Implementado** + conciliação automática a cada 3 min |
| Cancelamento de cobrança | **Implementado** (reservas expiradas têm a cobrança cancelada) |
| Cartão de crédito/débito | **Não existe na API da Cora.** A Cora anuncia venda no crédito por *link de pagamento* como "em breve", sem API. A camada de pagamentos já aceita o método `cartao`: ele aparece para o cliente assim que um provedor o declarar em `methods` |
| Pix recorrente / Pix Automático | **Não consta na referência da API da Cora nem na página do Cora Pro.** O método `pix_automatico` já existe no banco e na camada de pagamentos, mas fica inativo até um provedor o suportar |
| Carnê (boleto parcelado) | Existe na Cora, não usado (bolão é pagamento único) |
| Nota fiscal de serviço (NFS-e) | **Implementado** pela API da Cora (beta): emissão vinculada à cobrança, consulta, cancelamento, cadastro do emissor, registro manual e relatório. Veja a seção 7-A |

## 2. Credenciais da Cora

1. Conta Cora **PJ** (CNPJ). A API exige o plano **Cora Pro** (R$ 44,90/mês na data desta entrega, conforme a página do plano). Na tabela de tarifas da Cora, o QR Code Pix emitido por API custa 1% da cobrança paga (máx. R$ 0,50) e a NFS-e custa R$ 0,49 por nota no Cora Pro — confirme os valores vigentes no painel.
2. Painel Cora → *Integrações* → *Integração direta*: gere o **Client ID**, o **certificado** (`certificate.pem`) e a **chave privada** (`private-key.key`).
3. Converta para base64 (cabem em uma variável de ambiente):
   ```bash
   base64 -w0 certificate.pem    # -> CORA_CERT_BASE64
   base64 -w0 private-key.key    # -> CORA_KEY_BASE64
   ```
   > Guarde a chave privada como segredo. Nunca a coloque no repositório.

## 3. Variáveis de ambiente (Coolify → Environment Variables)

| Variável | Valor | Observação |
|---|---|---|
| `PAYMENT_PROVIDER` | `cora` | |
| `CORA_ENV` | `stage` (testes) ou `production` | Comece em `stage` |
| `CORA_CLIENT_ID` | seu client id | |
| `CORA_CERT_BASE64` / `CORA_KEY_BASE64` | certificado e chave em base64 | marque como **runtime** (não *build*) |
| `PAYMENT_WEBHOOK_SECRET` | texto longo aleatório | protege o webhook |
| `PUBLIC_API_URL` | `https://bl.buscarr.com.br` | usada para montar a URL do webhook |
| `PAYMENTS_ENABLED` | `true` | libera reservas/pagamentos na API |
| `PLATFORM_PAYMENTS_ENABLED` | `true` | libera a tela de compra no site |
| `PAYMENT_BOLETO_DUE_DAYS` | `2` | vencimento do boleto |
| `PAYMENT_BOLETO_MIN_HOURS_TO_CUTOFF` | `96` | boleto só até 96 h antes do corte (compensa em até 3 dias úteis) |
| `CORA_MIN_AMOUNT` | `5` | mínimo da Cora |
| `NFSE_*` | veja a seção 7-A | nota fiscal de serviço; comece com `NFSE_MODE=off` ou `manual` |

**Segurança:** no Coolify, desmarque *Build Variable* para `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CORA_*` e `PAYMENT_WEBHOOK_SECRET`. Variáveis de build aparecem em texto nos logs de deploy. Se os segredos JWT já apareceram em logs, **gere novos** antes de abrir ao público.

## 4. Homologação (faça nesta ordem)

1. Faça o deploy com `PAYMENT_PROVIDER=cora`, `CORA_ENV=stage`.
2. Rode o teste de fumaça (terminal do container ou local, com as variáveis exportadas):
   ```bash
   pnpm --filter @bolaocerto/api cora:smoke
   ```
   Deve autenticar, criar Pix e boleto, consultar e cancelar. Com `CORA_SMOKE_NFSE=yes` ele também consulta (sem emitir) a disponibilidade de NFS-e, seus CNAEs e códigos de serviço. **Se algum campo vier vazio** (linha digitável, copia e cola), envie a saída: os nomes dos campos da resposta da Cora são lidos de forma tolerante, mas é aqui que se confirma.
3. Painel admin → **Configurações** → *Cadastrar webhooks na Cora* (registra `invoice paid` e `invoice canceled` apontando para `PUBLIC_API_URL/api/v1/webhooks/pagamento/cora?token=…`).
4. Faça uma compra de teste pelo site (Pix e boleto) e confirme: status muda para *pago* sozinho; cota fica *paga*; comissão (se houver afiliado) fica *pendente*.
5. Só então troque `CORA_ENV=production`, refaça o cadastro do webhook (com as credenciais de produção) e teste com R$ 5,00 reais.

> O webhook da Cora **não é assinado**. Por isso o sistema nunca confia no aviso: ao recebê-lo, consulta a cobrança na API da Cora e só então confirma. Se o aviso falhar, a conciliação automática (a cada 3 min) confirma do mesmo jeito.

## 5. Regras de pagamento

- **Pix:** vale pelo prazo da reserva (`SHARE_RESERVATION_MINUTES`, padrão 15 min). Passado o prazo, a cobrança é cancelada na Cora.
- **Boleto (com Pix):** reserva da cota dura até o vencimento do boleto. Indisponível quando faltam menos de 96 h para o corte do concurso.
- **Pagamento tardio:** se o participante pagar após a reserva expirar, o sistema **reativa a cota se ainda houver estoque**; se o bolão já lotou, o pagamento fica em *Pagos sem cota — estornar* (aba “Quem não pagou” dos relatórios) para devolução manual. Nunca vende acima do total.
- **Estorno/cancelamento:** devolve o estoque e cancela a comissão pendente.

## 6. Operação manual (balcão)

- **Cotas → Registrar venda de balcão:** cria a venda para um participante já cadastrado (dinheiro, Pix direto, transferência, maquininha). Exige confirmação de que o participante aceitou o termo.
- **Cotas → Dar baixa:** confirma o recebimento de uma reserva (registra forma, observação e quem deu a baixa — tudo na auditoria).
- **Cotas → Cancelar:** cancela cota, devolve estoque e cancela comissão pendente.
- **Concursos → Cadastrar concurso manualmente:** plano B se a API da CAIXA bloquear o servidor.

## 7. Relatórios (menu Financeiro → Relatórios)

Todos aceitam período (`de`/`ate`) e exportam **XLSX** (formatado, filtros e cabeçalho fixo) ou **CSV** (UTF-8, `;`, abre direto no Excel):

- **Resumo financeiro:** receita bruta, custo dos jogos, taxa de administração, comissões (pendente/paga), resultado da plataforma, ticket médio, a receber (no prazo e vencido), formas de pagamento, cotas por situação, alerta de pagamentos sem cota.
- **Vendas de cotas:** planilha mestre (participante, CPF, contato, bolão, valores, pagamento, afiliado, comissão).
- **Pagamentos e conciliação:** um registro por pagamento, com forma, provedor, ID da cobrança, custo dos jogos, taxa de administração, comissão, resultado da plataforma e situação da nota fiscal.
- **Quem não pagou:** reservas pendentes/vencidas + pagamentos sem cota.
- **Comissões:** por afiliado (a pagar, paga, cancelada, chave Pix).
- **Notas fiscais:** situação, número, valor, ISS estimado e quantidade de pagamentos ainda sem nota.
- **Por bolão:** ficha completa do bolão (participantes, resumo, jogos).

CPF aparece mascarado na tela e **completo nas planilhas**. Cada exportação é registrada na auditoria (`relatorio.exportado`).

## 7-A. Nota fiscal de serviço (NFS-e) pela Cora

A Cora emite a NFS-e por API (em **beta**). Como funciona neste sistema:

1. A nota é **vinculada à cobrança paga** (boleto/Pix da Cora). Ela não é emitida para vendas de balcão ou baixas manuais: para essas, use **Registrar nota manual** (número e link do PDF) no painel.
2. A Cora precisa do **endereço do tomador** (participante). O participante informa em *Minha conta → Endereço para nota fiscal* (a tela aparece quando a emissão está ligada e ele já tem cota paga). O admin também pode informar o endereço ao emitir.
3. **Atenção fiscal:** a API da Cora não recebe um valor próprio para a nota; ela é emitida **pelo valor da cobrança**. No modelo de mandato, a receita do serviço é a *taxa de administração*. Confirme com o contador se esse comportamento atende ao seu enquadramento antes de ligar. O painel repete esse aviso.

### Passo a passo de configuração

1. Na Cora Web, confirme que sua empresa e cidade estão habilitadas e envie o **certificado digital A1** (a Cora deixa a nota em `aguardando certificado` até isso).
2. Com o contador, defina: alíquota do ISS (`NFSE_ISS_PCT`, ex.: `5`), código de serviço (`NFSE_SERVICE_CODE`), CNAE (`NFSE_CNAE`), regime tributário e inscrição municipal.
3. Preencha as variáveis `NFSE_*` (lista em `.env.production.example`) no Coolify. Mantenha `NFSE_MODE=manual` no início.
4. Painel → **Notas fiscais**: clique em **Verificar na Cora** (mostra se a cidade está habilitada e lista seus CNAEs e códigos de serviço) e depois **Cadastrar emissor**.
5. Emita uma nota de teste em `CORA_ENV=stage`. Só depois mude `CORA_ENV=production`.
6. Se tudo estiver correto, mude para `NFSE_MODE=auto`. A rotina roda a cada 5 minutos: emite as notas dos pagamentos confirmados cujo participante já informou o endereço (somente a partir de `NFSE_AUTO_SINCE`, ou dos últimos 30 dias) e atualiza status, PDF e XML das notas pendentes.

### Situações da nota

| Situação | Significado |
|---|---|
| `aguardando` | A Cora aguarda o pagamento da cobrança vinculada |
| `aguardando certificado` | Falta o certificado A1 na Cora |
| `emitida` | Emitida; PDF e XML disponíveis |
| `erro` | A prefeitura recusou. Corrija inscrição municipal, regime, código de serviço ou endereço e use **Tentar de novo** |
| `cancelada` | Cancelada (algumas cidades só permitem cancelar no portal da prefeitura) |

Falhas temporárias de rede **não** criam registro de erro, e a rotina tenta de novo sozinha. Recusas da Cora (dados a corrigir) ficam registradas e **não** são repetidas automaticamente.

### Endpoints usados (referência oficial da Cora)

`POST /fiscal-receipts/issuer` · `GET /fiscal-receipts/businesses/check-availability` · `GET /fiscal-receipts/businesses/cnaes` · `GET /fiscal-receipts/businesses/service-codes` · `POST /fiscal-receipts/service-receipt` · `GET /fiscal-receipt-api/service-receipt/{id}` (com alternativa em `/fiscal-receipts/service-receipt/{id}`) · `DELETE /fiscal-receipts/service-receipt/{id}`.

> A documentação pública da Cora não descreve o corpo das respostas de emissão e consulta. O código lê os campos `id`, `status`, `pdf` e `xml` de forma tolerante. **Valide na homologação** com uma nota real em `stage`.

## 8. Checklist de entrada em produção

- [ ] `pnpm install --frozen-lockfile` passa e o CI está verde
- [ ] Homologação Cora concluída (itens 4.1 a 4.4)
- [ ] Segredos JWT rotacionados e `CORA_*` marcados como *runtime*
- [ ] Backup agendado do Postgres no Coolify
- [ ] `PAYMENTS_ENABLED=true` **e** `PLATFORM_PAYMENTS_ENABLED=true`
- [ ] Parecer jurídico/contábil sobre o modelo de mandato, taxa de administração e emissão fiscal (inclui a nota emitida pelo valor da cobrança)
- [ ] Se for usar NFS-e: plano Cora Pro, certificado A1 enviado, emissor cadastrado, nota de teste emitida em `stage`
- [ ] Teste real de R$ 5,00 em produção (Pix e boleto)

## 9. O que ainda não existe (e por quê)

- **Cartão de crédito** e **Pix Automático (recorrente mensal):** a API da Cora não oferece. A estrutura está pronta (métodos `cartao` e `pix_automatico` no banco, no DTO e na tela de compra), mas o fluxo de cada um depende do provedor (tokenização e 3DS no cartão; autorização do mandato e cobranças recorrentes no Pix Automático). Não há como entregá-los de forma honesta sem um provedor que os ofereça. Se a Cora lançar, basta o `CoraProvider` declarar o método em `methods` e implementar a criação da cobrança.
- Cashback, apuração automática de prêmios por cota, envio de e-mail/WhatsApp e recuperação de senha.
