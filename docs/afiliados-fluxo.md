# Fluxo do afiliado

1. **Convite do administrador.** Em Painel → Convites, escolha "afiliado", informe o e-mail e gere. O e-mail sai com o link `/r/CODIGO` (o link também pode ser copiado).
2. **Cadastro.** O link abre a tela de cadastro com o e-mail já preenchido e a chave Pix para comissões. Convite feito por administrador já aprova o afiliado: ele entra direto na área de afiliado, com o **grupo dele criado automaticamente** e o código próprio.
3. **Link de venda.** Na área do afiliado, em cada bolão aberto, "Copiar link de venda" gera `/r/CODIGO-DO-AFILIADO?bolao=ID`. O link abre o bolão e guarda o afiliado para a comissão.
4. **Cotista.** Quem se cadastra pelo link do afiliado (ou compra num bolão do grupo dele) **entra sozinho no grupo do afiliado**. O tamanho do grupo define quantas cotas os bolões do afiliado podem ter.

Regras:
- Convite de um afiliado para outro afiliado continua aguardando aprovação do administrador.
- Afiliados aprovados antes desta versão ganham o grupo na primeira vez que abrem a área deles.
- Trocar o papel de um usuário para "afiliado" (Painel → Usuários) também cria o cadastro, o código e o grupo; voltar a ser afiliado reativa o cadastro.

## Para onde cada papel vai ao entrar
- Cliente: `/aplicativo` (bolões, compra, comprovantes, histórico).
- Afiliado: `/afiliado` (grupo, bolões, link de venda, comissões).
- Equipe (operação): painel, só a tela "Para fazer".
- Administrador: painel completo.
O app instalado abre no início do cliente e, se a pessoa já estiver logada com outro papel, vai direto para a área dela.
