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
| Cartão de crédito/débito | **Não existe na API da Cora** — exige outro provedor (a camada `PaymentProvider` permite adicionar) |
| Pix recorrente / automático | **Não consta na API da Cora** — não implementado |
| Carnê (boleto parcelado) | Existe na Cora, não usado (bolão é pagamento único) |
| Nota fiscal de serviço (NFS-e) | A Cora tem API em beta; **não implementado** (definir enquadramento com o contador) |

## 2. Credenciais da Cora

1. Conta Cora **PJ** (CNPJ). A integração direta exige o plano indicado no portal de desenvolvedores da Cora — confirme no painel.
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

**Segurança:** no Coolify, desmarque *Build Variable* para `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CORA_*` e `PAYMENT_WEBHOOK_SECRET`. Variáveis de build aparecem em texto nos logs de deploy. Se os segredos JWT já apareceram em logs, **gere novos** antes de abrir ao público.

## 4. Homologação (faça nesta ordem)

1. Faça o deploy com `PAYMENT_PROVIDER=cora`, `CORA_ENV=stage`.
2. Rode o teste de fumaça (terminal do container ou local, com as variáveis exportadas):
   ```bash
   pnpm --filter @bolaocerto/api cora:smoke
   ```
   Deve autenticar, criar Pix e boleto, consultar e cancelar. **Se algum campo vier vazio** (linha digitável, copia e cola), envie a saída: os nomes dos campos da resposta da Cora são lidos de forma tolerante, mas é aqui que se confirma.
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
- **Quem não pagou:** reservas pendentes/vencidas + pagamentos sem cota.
- **Comissões:** por afiliado (a pagar, paga, cancelada, chave Pix).
- **Por bolão:** ficha completa do bolão (participantes, resumo, jogos).

CPF aparece mascarado na tela e **completo nas planilhas**. Cada exportação é registrada na auditoria (`relatorio.exportado`).

## 8. Checklist de entrada em produção

- [ ] `pnpm install --frozen-lockfile` passa e o CI está verde
- [ ] Homologação Cora concluída (itens 4.1 a 4.4)
- [ ] Segredos JWT rotacionados e `CORA_*` marcados como *runtime*
- [ ] Backup agendado do Postgres no Coolify
- [ ] `PAYMENTS_ENABLED=true` **e** `PLATFORM_PAYMENTS_ENABLED=true`
- [ ] Parecer jurídico/contábil sobre o modelo de mandato, taxa de administração e emissão fiscal
- [ ] Teste real de R$ 5,00 em produção (Pix e boleto)

## 9. Fora do escopo desta entrega

Cartão, Pix recorrente, nota fiscal, cashback, apuração automática de prêmios por cota, envio de e-mail/WhatsApp e recuperação de senha.
