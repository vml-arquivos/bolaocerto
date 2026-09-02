# Administração operacional — BL — Bolão Livre

## Escopo

A administração do BL é uma aplicação interna separada da vitrine pública. Ela usa sidebar própria, topbar contextual, filtros, tabelas com scroll horizontal e estados vazios informativos. A organização foi inspirada estruturalmente no PermuPay Vendas, mas as regras foram reescritas para o contexto de bolões, jogos, cotas, Pix, afiliados e operação.

## Módulos

A navegação administrativa cobre visão geral, concursos, bolões, jogos/apostas, cotas, participantes, fila operacional, comprovantes, recebimentos, pagamentos, comissões, repasses, afiliados, usuários, lotéricas parceiras, auditoria e configurações.

A visão geral calcula no servidor os KPIs de usuários, estados dos bolões, estoque disponível, cotas por estado, recebimentos confirmados, custo dos jogos, taxas administrativas, comissões pendentes/pagas, afiliados aprovados e fila de cutoffs. As telas de bolões exibem múltiplos jogos e ações de visualizar, duplicar, publicar, fechar e cancelar; o backend valida cada transição e audita as mudanças.

## Permissões

Cotistas participam e acompanham cotas. Afiliados divulgam links e acompanham suas comissões, mas não criam nem editam bolões. Operação registra bolões e comprovantes. Administradores criam, editam, publicam, fecham, cancelam, conciliam e gerenciam todos os módulos. A restrição de criação/edição de bolões está no controller e no service, não somente na interface.

## Precificação

O custo dos jogos, receita prevista, taxa administrativa e margem são recalculados no backend com `Prisma.Decimal`. O frontend exibe uma prévia para facilitar a operação, mas o servidor permanece como fonte de verdade. Para um bolão com `N` cotas, valor unitário `V`, taxa `T` e custo acumulado dos jogos `C`, o servidor calcula `receita = N × V`, `taxa = receita × T / 100` e `margem = taxa - C`.

## Comissão e repasse

A comissão é gerada no fluxo de pagamento confirmado, com chave única por cota/afiliado quando aplicável. O código de indicação é resolvido a partir de `/r/CODIGO`, armazenado em cookie HTTP-only e injetado no proxy somente no endpoint de reserva; o backend valida o código e nunca aceita `afiliadoId` arbitrário. O administrador seleciona comissões pendentes, cria um lote, visualiza afiliado, chave Pix, quantidade e total e registra o repasse manual com data, referência, comprovante e observação. A marcação de pago atualiza o lote e as comissões numa transação auditada.

## Banco e migration

A migration `0002_admin_operacional` é incremental. Ela cria `jogos_bolao` para representar vários jogos por bolão, cria `repasses_lotes` para agrupamento e adiciona campos auditáveis às comissões. Não usa `DROP`, `TRUNCATE`, reset, recriação de PostgreSQL ou deleção de volumes. Bolões legados continuam compatíveis por meio de `numerosApostados` e fallback de jogo único.

## Pagamentos

O runtime anuncia somente Pix, que é o único método implementado. Cartão e boleto não são apresentados como disponíveis. Nenhuma credencial ou ativação de pagamento real é criada por esta expansão.

## Validação

A sequência validada localmente é `pnpm install --frozen-lockfile`, geração do Prisma Client, validação Prisma com URL sintética, lint dos workspaces, testes unitários, smoke test HTTP administrativo, builds de web/API/worker e `git diff --check`. O E2E usa um módulo HTTP isolado com mocks, portanto não substitui um teste de integração contra banco de homologação.
