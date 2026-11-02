# E-mails, comprovantes e mensagens aos clientes

## O que sai por e-mail (Brevo)
| Situação | Quando sai |
|---|---|
| Esqueci minha senha | na hora, link válido por 60 minutos |
| Senha alterada | na hora, aviso de segurança |
| Boas-vindas | ao criar a conta |
| Convite (administrador ou afiliado) | na hora, se o campo "e-mail" do convite foi preenchido; o link também fica para copiar |
| Pagamento confirmado | até 1 minuto, com os comprovantes do bolão já liberados anexados |
| Comprovante do jogo / recibo da cota | até 1 minuto depois que a equipe sobe o arquivo, **com o arquivo anexado** |
| Mensagem da equipe | só se marcar "mandar também por e-mail" |

Limites: anexos somam no máximo 8 MB por e-mail. O plano grátis da Brevo tem limite diário de envios; mensagens para muita gente devem ir só por aviso no celular/conta.

## Comprovante do jogo para todos os cotistas
1. Registre o jogo na CAIXA e, no painel, abra o bolão → Comprovantes e envie o arquivo (deixe "visível aos participantes").
2. Cada cotista que já pagou recebe: aviso na conta, aviso no celular (se ligou) e e-mail com o arquivo anexado.
3. Quem comprar depois recebe os comprovantes já liberados junto com o e-mail de pagamento confirmado.
4. Para mandar de novo (ex.: o cotista não achou o e-mail): botão **Reenviar aos cotistas** ao lado do arquivo.

## Avisos no celular (push / PWA)
- O cliente liga em **Minha conta → Avisos no celular → Ligar avisos neste aparelho** (funciona no Android, no computador e no iPhone com o app instalado na tela de início).
- Todo aviso da conta (pagamento, comprovante, bolão apurado, cota premiada) vira push automaticamente.
- As chaves de push (VAPID) são criadas pelo sistema na primeira vez e guardadas no banco. Se preferir fixar as suas, use `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT`.

## Mensagens da equipe para os clientes
Painel → **Mensagens aos clientes**. Escolha o público (todos, só clientes, só afiliados, quem tem cota em um bolão, pessoas de um grupo, ou quem ligou o aviso no celular), escreva título e mensagem e envie. O painel mostra antes quantas pessoas vão receber. Fica o histórico das mensagens enviadas.
