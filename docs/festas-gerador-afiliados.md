# Concursos de festa, gerador de jogos e afiliados vendedores

## 1. Concursos de festa (Mega da Virada, São João etc.)
- No painel: **Admin → Concursos → Criar concurso de festa**. Escolha a festa (ou "Outra"), a data do sorteio e, se já souber, o número do concurso e o prêmio. Pode deixar número e prêmio em branco: o concurso aparece como **"número a definir"** e já dá para criar bolões e vender cotas.
- Por dentro: o sistema guarda um número provisório negativo (`-AAAAMMDD`). Na tela ele sempre aparece como "a definir".
- Quando a CAIXA publicar o concurso real do mesmo dia, a sincronização **adota** o concurso de festa: os bolões e as cotas continuam valendo, só o número vira o oficial. Também dá para informar o número oficial e o prêmio na mão (botão no concurso).
- Festas prontas: Mega da Virada, Mega São João, Mega Páscoa, Mega da Independência, Lotofácil da Independência, Quina de São João, Dupla de Páscoa.

## 2. Gerador de jogos (na criação do bolão)
- Informe **quantos jogos** (1 a 100) e **quantos números por jogo**. Antes mesmo de gerar, o sistema mostra o valor do registro na CAIXA (preço oficial vigente × quantidade de jogos). Depois de gerar, mostra o custo de cada jogo e o total.
- Estratégias: equilibrado, totalmente aleatório, mais sorteados, mais atrasados e misto. Dá para fixar números que devem entrar e números a evitar.
- **Importante:** é um gerador aleatório inteligente (sem repetir jogos, evitando padrões comuns). Nenhuma estratégia aumenta a chance de ganhar; o texto do próprio sistema avisa isso.
- Funciona para Mega-Sena, Lotofácil, Quina, Dupla Sena e Lotomania (as modalidades que o sistema apura).

## 3. Afiliado = vendedor
- Afiliado **não traz outros afiliados**: convite de afiliado só pelo administrador.
- Afiliado cria **grupos** e convida pessoas. Quem se cadastra pelo convite do grupo (ou clica em "Participar do grupo" na página `/grupos/<slug>`) entra no grupo.
- **Limite de cotas:** o bolão do afiliado só pode ter, no máximo, o número de pessoas do grupo. O administrador pode liberar pessoas a mais em Admin → Grupos → "Liberar mais cotas".
- **Aprovação:** o afiliado cria o bolão e clica em "Pedir aprovação". O administrador vê o bolão como "Aguardando aprovação" e escolhe **Aprovar e abrir venda** ou **Recusar** (com motivo; o afiliado recebe aviso). A regra de enviar o comprovante antes da venda continua valendo.
- **Comissão:** percentual do afiliado × taxa de administração de cada cota paga. Se o bolão é do grupo de um afiliado aprovado, a comissão vai para ele; senão vale o link de indicação. Compra do próprio afiliado não gera comissão.

## 4. Home
A seção **Bolões já sorteados** aparece na página inicial sempre que existir concurso sorteado: números oficiais, acertos de cada jogo e se o bolão foi premiado.

## Datas comemorativas, regras de venda e pré-venda (v9)

- **Qualquer loteria da CAIXA** pode ter concurso de festa (Mega da Virada, Quina de São João, Lotofácil da Independência, Timemania, Dia de Sorte, Super Sete, Loteca…). A cotação automática e o gerador de jogos continuam só para Mega-Sena, Lotofácil, Quina, Dupla Sena e Lotomania; nas demais o administrador informa os jogos e o valor.
- No formulário **Novo bolão** o administrador usa "Criar para uma data comemorativa": escolhe a data pronta ou digita um nome, informa o dia do sorteio e o concurso provisório já aparece selecionado. Quando a CAIXA publicar o concurso oficial, o número é adotado e os bolões continuam valendo.
- **Regras de venda** (por bolão): início e fim da venda (o fim não passa do prazo do concurso), máximo de cotas por pessoa (conta cotas pagas e reservas ainda válidas) e um texto de regras que o cliente vê. Podem ser editadas mesmo em bolão precificado.
- **Pré-venda** (só administrador): vende as cotas sem comprovante prévio. O jogo é registrado depois do fim das vendas e o comprovante vai para todos os cotistas. Sem pré-venda, continua valendo a regra de só vender com comprovante anexado.
- Migração nova: `20261103000000_regras_venda_pre_venda` (campos em `boloes`). Roda sozinha no deploy.

## Automação do bolão (v16)

**Data e hora da festa vêm preenchidas.** Ao escolher a data comemorativa em Bolões, o dia e a hora do sorteio já aparecem (Mega da Virada 2026: 1º/01/2027 às 10h, conforme calendário da CAIXA). O administrador pode ajustar. Quando a CAIXA ainda não confirmou, a tela avisa "data prevista". Para as outras festas, o sistema calcula a data tradicional (Páscoa, São João, Independência) às 20h; **confira sempre no site da CAIXA**.

- Calendário e previsões: `packages/shared-types/src/festas.ts` (`FESTAS_CALENDARIO`, `proximoSorteioFesta`). Quando a CAIXA anunciar uma data nova, basta incluir a linha no calendário.
- `POST admin/concursos/festa` aceita `horaSorteio` (HH:mm, padrão 20:00).
- **Corte das apostas:** horário padrão da modalidade (19h) ou 1 hora antes do sorteio, o que for mais cedo. Sorteio às 10h fecha às 9h.
- A sincronização com a CAIXA não zera mais a hora e o corte de um concurso de festa do mesmo dia.
- Quando a CAIXA publica o concurso oficial, ele herda a hora e o corte da festa.

**Valores automáticos.** O gerador lista só os tamanhos de aposta que a CAIXA vende, com o preço oficial (tabela de preços). O custo dos jogos e o valor da cota são calculados na hora, mesmo antes de escolher concurso/grupo; ao salvar, a cotação do servidor confirma o valor.

**Gerador de jogos.** Até 100 jogos por bolão, com qualquer quantidade de números disponível na tabela da CAIXA. É um gerador estatístico (histórico de sorteios + regras de equilíbrio), não uma previsão: todo jogo tem a mesma chance.

**Tabela de preços da CAIXA (v18).** O sistema carrega sozinho a tabela oficial de preços ao iniciar e quando faltar algum preço na hora de cotar. Antes, se o banco não tivesse a tabela, a lista de "números em cada jogo" ficava vazia e dava o erro "Preço vigente ausente". Preço já cadastrado nunca é sobrescrito.
