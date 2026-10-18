# Bolão condicional, relatórios, CRM e recibo

Guia operacional das funções de gestão do Bolão Livre. Tudo fica no painel administrativo (`/admin`).

## 1. Bolão condicional (cotas liberadas só com prêmio alto)

Ao criar o bolão, marque **Bolão condicional** e informe o **prêmio mínimo** (ex.: R$ 100.000.000,00).

- Enquanto o prêmio estimado do concurso for menor que o gatilho, as cotas ficam **bloqueadas** (a API recusa a reserva e a vitrine mostra a barra de progresso).
- Quando o worker sincroniza o concurso e o prêmio estimado atinge o gatilho, o bolão é **liberado automaticamente**. A liberação é gravada (`liberadoEm`) e **não volta atrás** se o prêmio cair depois, para não prender quem já comprou.
- O admin pode **liberar manualmente** em *Controle por bolão* (botão "Liberar cotas agora"); a ação é auditada.
- Migration: `0009_bolao_liberacao_por_premio` (roda sozinha no `prisma migrate deploy`).

## 2. Controle por bolão e relatórios

Menu **Controle por bolão**: lista de bolões com ocupação, receita, quem comprou, quem pagou e quantas cotas. Dentro de cada bolão há a ficha completa dos participantes, com filtros por situação (pagas, pendentes, expiradas).

Menu **Relatórios** (todos com **PDF, XLSX e CSV**): resumo financeiro, vendas de cotas, pagamentos e conciliação, quem não pagou, comissões, notas fiscais e por bolão. Filtros por período e status.

Rotas: `GET /api/v1/admin/relatorios/{resumo,boloes,vendas,nao-pagos,comissoes,pagamentos,notas-fiscais,boloes/:id}?formato=pdf|xlsx|csv|json`.

- **PDF**: cabeçalho, filtros aplicados, totais e rodapé numerado; CPF **mascarado**.
- **XLSX/CSV**: todos os campos, incluindo CPF completo (CSV em UTF-8 com BOM e `;`, abre direto no Excel brasileiro). Cada exportação é **auditada**.

## 3. CRM de apostadores

Menu **CRM de apostadores**: indicadores gerais, níveis, ranking dos maiores apostadores, lista **para reativar**, contatos programados e a ficha individual (histórico, modalidades preferidas, notas, etiquetas e próximo contato).

Níveis (pelo total investido em cotas pagas): Bronze, Prata, Ouro e Diamante. Segmentos (um apostador pode estar em vários): Apostador maior (VIP), Recorrente, Novo, Inativo, Com pendência e Ainda não compra. A etiqueta `vip` promove o apostador a VIP manualmente.

Limites configuráveis por ambiente (todos opcionais):

| Variável | Padrão | Significado |
|---|---|---|
| `CRM_NIVEL_PRATA` | 1000 | R$ para nível Prata |
| `CRM_NIVEL_OURO` | 5000 | R$ para nível Ouro |
| `CRM_NIVEL_DIAMANTE` | 20000 | R$ para nível Diamante |
| `CRM_INATIVO_DIAS` | 90 | Dias sem comprar para ser "inativo" |
| `CRM_NOVO_DIAS` | 30 | Janela de "novo" |
| `CRM_RECORRENTE_MIN_BOLOES` | 3 | Bolões diferentes para ser "recorrente" |

Migration: `0010_crm_apostadores` (tabelas `crm_perfis` e `crm_notas`).

## 4. Recibo do cliente

Na área *Minha conta*, cada cota paga tem **Ver recibo** e **Baixar recibo (PDF)**. O recibo explica em linguagem simples:

1. quanto o cliente pagou;
2. quanto foi **aplicado nas apostas** (e, portanto, concorre ao prêmio);
3. a **taxa de administração** e para que serve;
4. a **comissão de indicação** (quando há afiliado), que sai da taxa e não aumenta o custo;
5. quanto **fica com a plataforma** (taxa menos comissão);
6. como o prêmio é dividido (proporcional às cotas, pago pela CAIXA).

O recibo tem **código de verificação** assinado (`RECEIPT_SECRET`). Qualquer pessoa pode conferir em `/verificar-recibo` ou `GET /api/v1/recibos/:id/verificar?codigo=`; a verificação pública não expõe dados pessoais.

> Defina `RECEIPT_SECRET` no Coolify e não o altere depois. Se ficar vazio, o sistema usa `JWT_ACCESS_SECRET`, o que significa que trocar o segredo do JWT invalida os códigos dos recibos antigos.

## Deploy

As migrations 0009 e 0010 rodam automaticamente. Nenhuma variável nova é obrigatória.
