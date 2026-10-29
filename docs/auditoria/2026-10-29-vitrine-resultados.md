# Revisão 2 — vitrine de vendas, encerramento e resultados

Esta revisão é cumulativa: contém as alterações da primeira auditoria e corrige o ciclo de exibição da página inicial. Não houve deploy nem acesso à administração do ambiente real.

## Comportamento entregue

1. A vitrine busca `GET /api/v1/boloes/disponiveis`. A consulta exige bolão e concurso abertos, prazo futuro, ausência de resultado oficial e estoque. A comparação de estoque ocorre antes do limite de registros no PostgreSQL. Bolões condicionais dentro do prazo podem aparecer como aguardando liberação; não permitem compra antes do gatilho.
2. Ao atingir o cutoff, o card sai da vitrine. Não depende de criar outro bolão, da atualização de status pelo worker nem da chegada do resultado. Criar outro bolão não exclui bolões ainda válidos do mesmo concurso/modalidade.
3. A página inicial exibe uma área separada de resultados/vendas encerradas. A rota `/resultados` lista os últimos 50 bolões encerrados e informa quando aguarda resultado. Apresenta as dezenas oficiais e o segundo sorteio da Dupla Sena quando disponível.
4. Resultados oficiais são apresentados mesmo que o bolão ainda não tenha sido marcado como registrado/apurado. Isso não significa afirmar que os bilhetes foram comprados: registro, comprovantes e apuração da participação permanecem informações distintas.
5. O detalhe de um bolão antigo continua acessível para consulta, mas não oferece nova reserva. O formulário usa o prazo e o resultado, além do status/estoque. A API valida novamente esses dados; o frontend não é a única proteção.
6. A tela consulta novas publicações/resultados a cada 30 segundos enquanto visível e ao recuperar foco. O relógio local usado pela vitrine e formulário é ancorado no horário recebido do servidor e avança a cada segundo. O backend continua sendo a autoridade em caso de atraso de rede, suspensão da aba ou relógio incorreto.
7. Cotas, pagamentos, comprovantes e histórico não são apagados. A rota pública antiga `/boloes` foi preservada para compatibilidade; a home usa a rota dedicada de vendas.
8. Um novo bolão aparece após criação e publicação pelo administrador. O sistema não gera automaticamente dezenas, bilhetes, compras ou cobranças. A sincronização do próximo concurso não equivale à criação de um bolão.

## Arquivos principais

- `apps/api/src/pools/pools.service.ts` e `pools.controller.ts`: consultas separadas de vitrine e histórico, resultado oficial no detalhe.
- `apps/api/src/shares/shares.service.ts` e `payments.service.ts`: bloqueio autoritativo por prazo, estado do concurso e resultado publicado.
- `apps/web/app/page.tsx`: vitrine nova e seção de resultados.
- `apps/web/app/resultados/page.tsx`: histórico público recente.
- `apps/web/components/pool-history.tsx`: resultados e estado aguardando sincronização.
- `apps/web/components/live-storefront.tsx`: atualização periódica e relógio de venda.
- `apps/web/lib/pool-availability.ts`: regras de disponibilidade compartilhadas pelos componentes web.
- `apps/web/components/lottery-catalog.tsx`, `pool-card.tsx`, `purchase-form.tsx` e `app/boloes/[id]/page.tsx`: filtros e compra protegidos.

Não há migração adicional de banco para esta revisão. Quem parte do repositório original ainda precisa aplicar a migração da primeira entrega e cadastrar os preços conforme o relatório principal.

## Evidências

- API: 33 suítes, 287 testes aprovados.
- Web: 9 testes de disponibilidade aprovados, incluindo limite exato do prazo, resultado com cutoff futuro, ausência de prazo, bolão antigo versus novo e cotas ilimitadas.
- Contratos HTTP/boot: 3 suítes, 15 testes aprovados.
- Total: 311 testes automatizados aprovados, além do smoke de HTML renderizado.
- TypeScript de todos os workspaces aprovado; build de produção aprovado, incluindo `/resultados`.
- Smoke HTTP do Next.js compilado, com API fictícia: bolão vencido fora da seção de venda, dezenas e segundo sorteio no histórico, detalhe antigo sem botão de reserva e novo bolão publicado na resposta seguinte.
- Scripts reproduzíveis do smoke: `apps/web/scripts/storefront-fixture.cjs` e `storefront-smoke.cjs`. Rodar `node apps/web/scripts/storefront-smoke.cjs` após o build. Usam dados sintéticos e portas locais 45100/45101; não apontam para produção.

A tentativa de executar teste visual com navegador não foi concluída: o Chromium não estava disponível e seu download falhou no ambiente. O smoke de HTML e os testes de disponibilidade não equivalem a testar interações JavaScript em navegador real. Também não houve homologação com dados reais, PostgreSQL/PSP/SMTP reais ou login administrativo.

## Antes de produção

Permanecem os bloqueios documentados na auditoria inicial: apuração das modalidades especiais, vinculação completa aos recibos oficiais, devoluções/conciliação, concorrência dos limites de jogo responsável e homologação das integrações. Esta revisão resolve a vitrine e o histórico; não converte automaticamente o projeto inteiro em produção homologada.

O GitHub não recebeu estas alterações. A tentativa de gravação anterior foi recusada com HTTP 403. O ZIP contém projeto completo e patch cumulativo contra a base original, para aplicar em branch de homologação. Não aplicar simultaneamente o patch antigo e o novo cumulativo sobre os mesmos arquivos.
