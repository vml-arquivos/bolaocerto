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
