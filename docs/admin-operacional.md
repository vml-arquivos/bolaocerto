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

A comissão é gerada no fluxo de pagamento confirmado, com chave única por cota/afiliado quando aplicável. O código de indicação é resolvido a partir de `/r/CODIGO`, armazenado em cookie HTTP-only e injetado pelo proxy no cadastro e na reserva; o backend valida o código, persiste o afiliado de origem do cadastro e nunca aceita `afiliadoId` arbitrário. O dashboard do afiliado expõe cadastros atribuídos, participantes, cotas, volume confirmado e histórico de comissões. O administrador seleciona comissões pendentes, cria um lote, visualiza afiliado, chave Pix, quantidade e total e registra o repasse manual com data, referência, comprovante e observação. A marcação de pago atualiza o lote e as comissões numa transação auditada.

## Banco e migration

A migration `0002_admin_operacional` é incremental. Ela cria `jogos_bolao` para representar vários jogos por bolão, cria `repasses_lotes` para agrupamento e adiciona campos auditáveis às comissões. Não usa `DROP`, `TRUNCATE`, reset, recriação de PostgreSQL ou deleção de volumes. Bolões legados continuam compatíveis por meio de `numerosApostados` e fallback de jogo único.

## Pagamentos

O runtime anuncia somente Pix, que é o único método implementado. Cartão e boleto não são apresentados como disponíveis. Nenhuma credencial ou ativação de pagamento real é criada por esta expansão.

## Validação

A sequência validada localmente é `pnpm install --frozen-lockfile`, geração do Prisma Client, validação Prisma com URL sintética, lint dos workspaces, testes unitários de administração, cadastro por indicação, reserva concorrente e pagamentos Pix, smoke test HTTP administrativo, builds de web/API/worker e `git diff --check`. O E2E usa um módulo HTTP isolado com mocks, portanto não substitui um teste de integração contra banco de homologação.

## Usuários: editar, excluir e CPF
- Painel → Usuários e acessos → "Editar / acessos / excluir". Editar dados, trocar papel, gerar link de senha e remover/reativar acesso exigem o administrador logado.
- **CPF completo**: nas telas do administrador (usuários, CRM, relatórios) o CPF aparece inteiro, sem máscara. O recibo que o cliente vê continua com CPF parcial.
- **Excluir conta** apaga de vez só conta sem histórico. Avisos, inscrições de push, links de senha e grupos saem junto. Cotas, contratos, bolões, repasses, afiliado etc. impedem a exclusão e o painel diz quais; nesse caso use "Remover acesso".

## Três tipos de pessoa (menu Pessoas)
- **Equipe do sistema**: administrador (financeiro, controle, relatórios) e equipe de operação. Fica em "Usuários e acessos", aba Equipe.
- **Afiliados**: entram só por convite do administrador, criam o próprio grupo e os próprios bolões, vendem as cotas e veem só o que é deles (bolões, cotas, vendas, receita, grupos e clientes). Não entram no painel do administrador. Telas: "Afiliados" (convite, comissão, contrato) e "Grupos".
- **Clientes (cotistas)**: só compram bolões. A tela "Clientes" mostra nível, investimento e segmento, só de cotistas com acesso ativo.
- "Usuários e acessos" tem abas Equipe / Afiliados / Clientes / Todos. Em qualquer lista (Clientes, Afiliados, Usuários) o botão "Editar / excluir" abre o mesmo editor: dados, papel, senha, remover acesso e excluir.
- Saíram do menu: Participantes (use Cotas), Quem indicou quem (não há rede de afiliados) e Convites (fica em Afiliados, botão "Ver convites emitidos"). Comissões e Pagar comissões ficam em Dinheiro.

## Superadmin e menu (v17)

**Superadmin** é a conta principal do sistema: o administrador do e-mail definido em `ADMIN_BOOTSTRAP_EMAIL` (a mesma variável da instalação, nada novo para configurar). Só ele vê e usa:

- **Excluir grupo** (Pessoas → Grupos). As pessoas continuam cadastradas, só saem do grupo. Não apaga o grupo oficial nem grupo que tenha bolões (preserva o histórico de vendas).
- **Excluir conta** de cliente, afiliado ou equipe sem movimentação financeira. Para afiliado, apaga junto os grupos dele sem bolões, os convites e o contrato aceito. Conta com cotas, comissões, vendas atribuídas, bolões criados, repasses ou grupo com bolões não é apagada: a tela explica o motivo e sugere "Remover acesso".
- A conta principal não pode ser excluída por ninguém. Toda exclusão fica no Histórico.

Administrador comum continua podendo excluir conta de cliente sem histórico e remover acesso.

**Menu lateral.** Resumo e Relatórios ficam fixos no topo. Os grupos são Jogos e vendas, Pessoas (Clientes, Afiliados, Grupos), Financeiro, Operação (inclui Mensagens aos clientes) e Administração (Usuários e acessos, Conexões, Histórico, Configurações). Só o grupo da tela atual fica aberto. "Instalar como app" virou uma linha discreta no rodapé e some quando o painel já está instalado.

## Página inicial (vitrine)

Painel → Jogos e vendas → **Página inicial**.

- **Carrossel do topo**: até 8 destaques. "+ Bolão" escolhe um bolão com cotas abertas (ex.: Mega da Virada); "+ Mensagem livre" cria um destaque com título, texto, botão e link (`/caminho` do site ou `https://`). Dá para ordenar, esconder e remover. Sem nenhum destaque, o site mostra sozinho os concursos de maior prêmio.
- **Bolões em destaque**: até 6 cartões logo abaixo do carrossel.
- **O que aparece na página**: liga/desliga próximos sorteios, últimos resultados, bolões sorteados, vendas encerradas, calendário, faixa de números, como funciona e perguntas frequentes. Seção sem conteúdo some sozinha.
- A configuração fica em `ConfiguracaoSistema` (chave `home.config`); não precisa de migração.
- **Últimos resultados** vêm dos resultados oficiais já sincronizados (Concursos → Sincronizar). Sem sincronização, a seção mostra um aviso.
- A taxa de administração não aparece mais no cartão do bolão; ela é detalhada na página do bolão (bilhete + taxa).
- Cada destaque do carrossel tem **etiqueta**, título, subtítulo, botão e link editáveis, e **imagem de fundo**: "Enviar minha imagem" (JPG/PNG/WEBP, o painel reduz sozinho) ou "Voltar à imagem padrão" do jogo. As imagens ficam guardadas no próprio banco (tabela de configurações), sem pasta nem variável nova.
