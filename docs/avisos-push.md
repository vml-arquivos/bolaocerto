# Avisos no celular (push)

Chegam na tela do celular mesmo com o app fechado. Funcionam no Android (Chrome, app instalado ou não) e no iPhone com o app instalado na tela de início (iOS 16.4 ou mais novo).

## Como a pessoa liga
Ao entrar, aparece o convite "Receba os avisos no celular" (cliente, afiliado e equipe). Um toque em **Ativar avisos** e o celular pede a permissão. Também dá para ligar e desligar em Minha conta.

## Quem recebe o quê
- **Cliente:** pagamento confirmado, comprovante do jogo, cotas liberadas, bolão apurado, cota premiada, avisos da administração.
- **Afiliado:** cadastro aprovado, nova pessoa no grupo, venda confirmada (com a comissão), bolão aprovado ou recusado, comissão paga.
- **Administrador:** bolão de afiliado aguardando aprovação.

## Como aparece
Título com emoji do assunto, texto curto, ícone do BL, selo de uma cor na barra de status, botão de ação ("Ver recibo", "Analisar agora"…) e imagem de destaque nos avisos de festa (cota premiada, cotas liberadas, afiliado aprovado). Cota premiada e bolão para aprovar são urgentes: vibram mais e ficam na tela até a pessoa tocar.

## Entrega
O servidor confere os avisos pendentes a cada 15 segundos. Aparelho que não responde mais é esquecido sozinho. As chaves de envio (VAPID) são criadas e guardadas no banco na primeira vez; não precisa configurar nada. Se quiser fixar as suas, use `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT`.

## Testar
1. Instale o app no celular, entre e toque em **Ativar avisos**.
2. No painel, em **Mensagens aos clientes**, envie um comunicado. Ele deve chegar na tela em até 15 segundos, com o app fechado.

Quem já tem o app instalado precisa tocar em "atualizar" no aviso de nova versão para o novo visual dos avisos valer.
