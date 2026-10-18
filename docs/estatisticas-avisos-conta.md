# Estatísticas, avisos, recuperação de senha e LGPD

Guia das funções entregues na versão de produção. Tudo roda sem configuração extra; o e-mail (SMTP) é opcional.

## 1. Estatísticas dos sorteios (`/estatisticas`)

Para cada modalidade (Mega-Sena, Lotofácil, Quina, Lotomania, Dupla Sena, Timemania, Dia de Sorte, Super Sete, +Milionária):

- **Frequência e atraso** de cada dezena, com mapa de calor ("quentes" e "frias").
- **Teste de uniformidade (qui-quadrado)**: diz se o histórico é compatível com sorteios totalmente aleatórios (na prática, sempre é).
- **Probabilidades exatas** (distribuição hipergeométrica): chance de cada faixa de prêmio para o número de dezenas jogadas, e quanto custa jogar mais dezenas.
- **Analisar meu jogo**: o visitante marca dezenas e vê soma, pares/ímpares, sequências, grupos, quantas já saíram juntas em sorteios passados e a chance exata de cada faixa.
- **Sugestões de jogos**: gera jogos que evitam padrões populares (datas até 31, sequências, progressões aritméticas), soma e paridade típicas. No assistente de criação de bolão do admin existe o botão **Sugerir jogo**.

### Aviso honesto (aparece nas telas)

Sorteios são independentes: **toda combinação tem exatamente a mesma chance**, e o histórico não prevê o próximo resultado. As estatísticas descrevem o passado e as sugestões só evitam combinações que muita gente joga (o que reduz a chance de dividir um prêmio, mas **não aumenta a chance de ganhar**). Não prometa previsão ao cliente.

### De onde vêm os dados

O histórico é importado automaticamente da API pública da CAIXA pelo **worker**, por número de concurso, de trás para frente, em lotes pequenos (padrão 25 por modalidade a cada ciclo de 5 minutos, até 400 concursos). Em alguns dias o histórico completo fica disponível. Para acelerar, no painel admin use **Importar histórico** (menu Concursos, botão ao lado de "Sincronizar agora"). Variáveis opcionais do worker:

| Variável | Padrão | Significado |
|---|---|---|
| `HISTORY_BACKFILL_DEPTH` | 400 | Quantos concursos buscar para trás (máx. 3000) |
| `HISTORY_BACKFILL_BATCH` | 25 | Concursos por modalidade a cada ciclo (máx. 200) |
| `HISTORY_BACKFILL_PAUSE_MS` | 250 | Pausa entre requisições (gentileza com a API da CAIXA) |

Na Dupla Sena, o segundo sorteio é guardado em `numeros_segundo_sorteio` e entra nas estatísticas.

API pública: `GET /api/v1/estatisticas`, `/:modalidade`, `/:modalidade/probabilidades`, `/:modalidade/sugestoes`, `POST /:modalidade/analisar`.

## 2. Avisos dentro da conta e e-mail

A área **Minha conta** mostra os avisos: pagamento confirmado, cota premiada, bolão liberado. Cada aviso pode ser marcado como lido.

Se o SMTP estiver configurado, os mesmos avisos também vão por e-mail (cada um uma única vez). Sem SMTP nada quebra: ficam só dentro da conta.

| Variável | Exemplo | Observação |
|---|---|---|
| `APP_PUBLIC_URL` | `https://bolaolivre.com.br` | Endereço usado nos links dos e-mails |
| `SMTP_HOST` | `smtp.seuprovedor.com` | Vazio = e-mail desligado |
| `SMTP_PORT` | `587` | 465 com `SMTP_SECURE=true` |
| `SMTP_SECURE` | `false` | `true` para SSL direto (porta 465) |
| `SMTP_USER` / `SMTP_PASS` | | Credenciais do provedor |
| `MAIL_FROM` | `BL — Bolão Livre <no-reply@seudominio>` | Remetente (use um domínio autenticado com SPF/DKIM) |

## 3. "Avise-me quando liberar" (bolão condicional)

Em um bolão condicional ainda bloqueado, o visitante logado clica em **Avise-me quando liberar**. Quando o prêmio estimado atinge o gatilho (ou o admin libera manualmente), o worker/API libera o bolão e cada interessado recebe **um** aviso. No painel, a lista de bolões mostra quantas pessoas pediram aviso, e o relatório do bolão traz o total.

## 4. Esqueci minha senha

- `/esqueci-senha` pede o e-mail. A resposta é sempre a mesma, exista ou não a conta (não revela quem é cliente). Máximo de 3 pedidos por hora por conta.
- O link vale **1 hora**, é de **uso único** e só o hash dele fica no banco. Um novo pedido invalida o anterior.
- Sem SMTP: no CRM, abra a ficha do apostador e use **Gerar link de redefinição de senha**; envie o link por um canal seguro. A geração é auditada.
- Dentro da conta há **Segurança → Alterar senha** (exige a senha atual).

> Limitação conhecida: o login usa cookies JWT sem lista de revogação. Trocar a senha não derruba sessões já abertas até o refresh expirar. Se houver suspeita de invasão, troque também `JWT_REFRESH_SECRET`.

## 5. LGPD

Em **Minha conta → Privacidade e dados**:

- **Baixar meus dados**: JSON com cadastro, cotas, termos aceitos, avisos e interesses (nunca inclui o hash da senha).
- **Solicitar exclusão da conta**: registra o pedido (auditado), avisa a pessoa e mostra um alerta na ficha do CRM. A exclusão em si é decisão humana: cotas em andamento e dados fiscais/de pagamento precisam ser mantidos pelo prazo legal.

## 6. Visual

Tipografia nova (Figtree, hospedada junto do site, sem chamadas ao Google), pesos mais leves (400/500/600, títulos sem negrito pesado), mais espaço entre linhas e raios de borda mais suaves, nos temas claro e escuro.

## Deploy

A migration `0011_estatisticas_senha_interesse` é aditiva e roda sozinha no `prisma migrate deploy`. Nenhuma variável nova é obrigatória.
