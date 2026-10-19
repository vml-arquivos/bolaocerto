# Referências de mercado e roadmap

## O que foi observado
- **Jackpocket (EUA, "courier" de loteria):** um representante compra o bilhete físico; o jogador recebe por e-mail uma **imagem em alta resolução do bilhete**, e o original fica guardado em cofre até o sorteio. Prêmios pequenos entram direto na conta. Fonte: https://www.lotteryusa.com/news/what-is-jackpocket
- **Bolões/syndicates oficiais (ex.: Lotterywest, Austrália):** cada integrante tem um **bilhete/cota individual** que o identifica para receber o prêmio, e a recomendação é manter um registro do grupo. Fonte: https://www.lotterywest.wa.gov.au/games/all-about-syndicates
- Padrão geral de jogo regulado: limite de gasto, pausa/autoexclusão — práticas comuns que adotamos por conta própria (não foram confirmadas nas fontes acima).

## Feito nesta versão (inspirado nisso)
| Ideia | Situação |
|---|---|
| Prova da aposta enviada ao cliente (comprovante/jogos registrados) | Feito: upload por bolão, visível ao participante |
| Recibo individual por cota | Feito: upload por cota, só o dono abre |
| Prazo de resgate visível | Feito: 90 dias após a apuração |
| Integridade do arquivo (hash) | Feito |
| Limite mensal e pausa 30/60/90/sem prazo | Feito |
| E-mail (SMTP) pronto + teste na tela | Feito |

## Ainda NÃO feito (próximos passos sugeridos)
1. Imagem do bilhete com marca d'água do bolão/cota.
2. Antivírus / análise de PDF nos uploads.
3. Notificações por WhatsApp e push.
4. Limites diário/semanal e depósito.
5. Reativar pausa sem prazo pelo painel (hoje é no banco).
6. Apuração automática de Super Sete, Loteca e +Milionária (hoje manual).
7. Parecer jurídico/regulatório (SPA/Lei 14.790) antes de escalar.
8. Assinatura/jogo recorrente (cota automática todo concurso).
