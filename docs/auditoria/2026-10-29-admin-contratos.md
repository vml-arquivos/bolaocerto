# Revisão 3 — Administração, comprovantes e contratos

Esta revisão é cumulativa sobre as duas entregas anteriores. Código preparado localmente; não publicado no GitHub nem implantado em bl.buscarr.com.br. Não foram apagados bolões do servidor.

## Alterações entregues

- Menu administrativo por grupos expansíveis, preservando as rotas anteriores. Formulário de criação recolhido; tabela mais compacta; acesso direto aos comprovantes em cada bolão.
- Exclusão definitiva por `DELETE /api/v1/admin/boloes/:id/sem-movimentacao`, exclusiva do administrador. A transação trava a linha, verifica cotas de QUALQUER situação, anexos inclusive removidos, contador de estoque e sinais de registro oficial; preserva o evento de auditoria antes de excluir. Não há limpeza em massa nem exclusão de pagamentos.
- Cancelamento continua separado. Reservas e pagamentos pendentes/confirmados impedem o cancelamento. Publicação e fechamento passam a reler o estado sob o mesmo bloqueio usado por compras.
- Botão **Novo lote** cria outro bolão em rascunho no mesmo concurso, com cotas independentes. Concurso encerrado não pode ser renovado. Novos bolões devem ter estoque finito. Não são copiados anexos, comprovantes, compradores nem pagamentos. Revise orçamento/jogos antes de publicar.
- Vitrine agrupa os lotes disponíveis do mesmo grupo e concurso. Um cartão fica em destaque e os demais podem ser abertos; não oculta outros organizadores nem mistura direitos de participantes. Esgotamento impede novas reservas; reservas vencidas podem devolver estoque, por isso o estado administrativo não é automaticamente encerrado ao reservar a última cota.
- Novos lotes exigem comprovante oficial em arquivo visível antes de publicar e reservar. Anexar um arquivo não verifica sua autenticidade junto à CAIXA: a equipe deve conferir concurso, jogos, quantidade, bilhete e custódia. Comprovante já anexado bloqueia alterações sensíveis do lote. Um novo lote exige um novo comprovante.
- Por compatibilidade, a migração mantém `comprovante_antes_venda=false` nos bolões existentes. Eles continuam com seu fluxo anterior de mandato. Não ative a nova exigência retroativamente sem conferir os registros. Os bolões novos recebem `true`.
- Upload de comprovante geral avisa cada comprador pago uma vez na fila transacional. Recibo individual continua restrito ao seu titular. Arquivos inicialmente ocultos avisam quando disponibilizados. Compradores posteriores recebem o aviso de confirmação e consultam os arquivos já existentes na conta. E-mail contém acesso autenticado, não anexo público nem comprovante exposto por URL aberta.
- Listas de vendas e painel consultam o servidor a cada 15 segundos, com pausa durante edição; relatórios têm atualização própria no mesmo intervalo. A vitrine mantém 30 segundos. Não é streaming instantâneo. Painel informa horário da consulta; erros não são convertidos em sucesso.
- Paginação nas listas administrativas, em vez de ficar restrita aos primeiros 50 registros. O contador de cotas pagas inclui também registradas, apuradas e premiadas.

## Contratos e proteção de dados

Documentos completos em `apps/api/src/legal/documents.ts`, expostos em `/termos`, `/privacidade` e `/contrato-afiliado`. São **minutas para revisão jurídica do modelo real**. Identificação do operador, restituições, repasses, custódia dos bilhetes, tratamento de prêmios, fornecedores e retenção precisam corresponder à operação efetiva.

O contrato de mandato não equivale a autorização regulatória, credenciamento de lotérica ou exoneração de responsabilidade. O recibo do BL não substitui o documento oficial da CAIXA. O aceite eletrônico é uma evidência; não se afirma certificação ICP-Brasil nem validade jurídica incondicional.

Novas reservas exigem aceite expresso e hash do documento exibido ANTES de enviar a compra. O servidor rejeita versão antiga. Guarda texto integral, hash SHA-256, versão, data, usuário, IP, agente do navegador e fotografia dos dados da compra. Aceites antigos permanecem com os dados que originalmente existiam; não se inventa texto retroativo.

O contrato de afiliado inclui seu percentual padrão na versão a aceitar; alterar esse percentual altera o hash e exige novo aceite antes de operar bolões. O histórico não é sobrescrito. As condições específicas de comissão por grupo precisam ser conciliadas com a regra comercial efetivamente configurada; esta entrega não redesenha a hierarquia de comissões.

`/minha-conta/contratos` permite consultar e imprimir contratos próprios. `GET /api/v1/conta/contratos` filtra pelo usuário autenticado. O arquivo de exportação da conta passa a incluir os novos campos do mandato. Venda de balcão registra explicitamente o **ateste do operador**, não uma assinatura eletrônica feita pelo cliente. A empresa precisa guardar a evidência presencial correspondente.

## Configuração indispensável antes de vender

A ausência da configuração abaixo bloqueia NOVAS contratações e operação de afiliados. Pagamentos de pedidos já existentes não são automaticamente cancelados.

- `LEGAL_OPERATOR_NAME`: razão social verdadeira.
- `LEGAL_OPERATOR_CNPJ`: CNPJ verdadeiro.
- `LEGAL_OPERATOR_ADDRESS`: endereço de atendimento.
- `LEGAL_CONTACT_EMAIL`: contato de atendimento e direitos LGPD que seja monitorado.
- `LEGAL_REFUND_TERMS`: procedimento, responsável, meio e prazo real de restituição para não execução.
- `LEGAL_AFFILIATE_PAYOUT_TERMS`: calendário, condições e conferência dos repasses.
- `LEGAL_APPROVED_VERSION=2026-10-29.1`: somente depois da revisão e adequação dos textos.

Opcionalmente, `LEGAL_PARTICIPACAO_TEXT`, `LEGAL_PRIVACIDADE_TEXT` e `LEGAL_AFILIADO_TEXT` substituem o texto completo. O texto substituto do contrato de afiliado recebe um adendo com seu percentual individual, incluído no hash, para manter a exigência de novo aceite quando o percentual mudar. Não use placeholders em produção. O antigo `MANDATO_TERM_HASH` não é mais usado para aceitar novas compras; o hash é calculado pelo servidor a partir do texto entregue.

O painel antigo ou clientes API próprios precisam enviar `aceitoTermos:true` e o hash atual na reserva. Venda manual também precisa enviar `termoMandatoHash`. Atualizar API e frontend juntos.

## Implantação e conferência

1. Faça backup verificável do PostgreSQL e dos arquivos de comprovantes. Preserve a chave de autenticação e as configurações atuais.
2. Instale dependências com lockfile. Gere Prisma e execute `pnpm db:migrate` em homologação, incluindo `20261029000000_pricing_delivery` da entrega anterior e `20261029010000_legal_evidence` desta revisão.
3. Execute `pnpm lint`, `pnpm test`, `pnpm test:e2e`, `pnpm build`. A integração real descartável está em `apps/api/scripts/financial-integration.ts`, com `DISPOSABLE_TEST_DATABASE=true`; nunca apontar para produção.
4. Configure os documentos e o SMTP real em homologação. Cadastre lote finito, anexe documento oficial de teste em ambiente de teste, publique, compre, confira baixa, extrato, aviso e download autenticado. Confirme que outro usuário não abre o arquivo.
5. Tente excluir um bolão sem vínculos e um com pagamento/anexo. O primeiro deve sair da lista com auditoria; o segundo deve ser bloqueado. Não prometa apagar testes que tenham movimentação financeira por este botão.
6. Complete um lote e publique outro do mesmo concurso: compras anteriores mantêm seu ID e comprovantes. Confirme os filtros, a paginação, os pagamentos e exportações após atualização automática.
7. Revise e execute plano de reversão. A migração é aditiva, mas o checkout novo depende dos novos campos e contratos. Não reverta o banco apagando evidências aceitas.

## Limites de validação e pendências

Esta revisão não certifica consistência de uma base de produção que não foi acessada. O teste HTTP usa adaptadores de banco simulados; não substitui a integração PostgreSQL, SMTP e provedor de pagamentos. Não houve navegação autenticada no servidor, exclusão de dados reais ou deploy. A renderização HTTP não substitui uma revisão visual completa em navegador.

Permanecem as limitações documentadas nas revisões anteriores: apuração de modalidades especiais, conciliação/estornos de gateway, falhas externas, testes concorrentes reais e capacidade em carga. A fila de e-mail pode reenviar após falha entre envio SMTP e gravação do resultado; não se promete entrega exatamente uma vez. O agrupamento público continua sujeito ao limite de 100 lotes da consulta atual.

LGPD exige medidas operacionais: inventário de dados/fornecedores, tabela de retenção, atendimento às solicitações, revisão de acesso, plano e registro de incidentes, contratos com operadores, backups e descarte efetivo. A página de privacidade não implementa essas medidas sozinha. A exclusão de conta já existente é uma solicitação, não expurgo automático.

## Fontes primárias consultadas em 29/10/2026

- LGPD, especialmente arts. 6, 7, 18, 37 e 46: https://www.presidencia.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm
- MP 2.200-2, art. 10: https://planalto.gov.br/ccivil_03/mpv/antigas_2001/2200-2.htm
- ANPD — publicações e orientações: https://www.gov.br/anpd/pt-br/documentos-e-publicacoes
- Manual de produtos CAIXA (recibos individuais e bolões): https://www.caixa.gov.br/Downloads/loterias-manual-de-produtos/MANUAL_DE_PRODUTOS_v18.pdf
- Orientação oficial CAIXA sobre Bolão: https://caixanoticias.caixa.gov.br/Paginas/Not%C3%ADcias/2025/12-DEZEMBRO/Mega-da-Virada-2025-saiba-como-funciona-o-bolao-CAIXA.aspx

Consulte a versão oficial vigente das regras da modalidade antes de operar; o documento de implementação não substitui parecer jurídico nem contrato aprovado.

## Evidência de validação local

- `pnpm lint`: TypeScript aprovado em todos os workspaces.
- `pnpm test`: passou; última suíte completa da API com 302 testes/36 suítes. Depois, a revisão do contrato personalizado de afiliado passou em 5 testes focados (incluindo 1 caso novo). Web: 9 testes de disponibilidade aprovados.
- `pnpm test:e2e`: 15 testes/3 suítes aprovados após atualizar o adaptador simulado de anexos para o novo bloqueio de linha.
- `pnpm build`: API, worker, shared-types e Next concluídos. API reconstruída após o último ajuste contratual.
- `node apps/web/scripts/storefront-smoke.cjs`: passou para vitrine, histórico, segundo sorteio, detalhe vencido sem checkout e novo bolão publicado. Usa API simulada e HTTP, sem comprovar interação visual.
- Script de integração financeira: TypeScript aprovado. Execução com PostgreSQL real ainda pendente; não há resultado de CI remoto desta revisão.
- `git diff --check`: aprovado.
