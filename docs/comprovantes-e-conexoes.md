# Comprovantes, conexões e jogo responsável

## 1. Comprovantes e jogos registrados (upload)
Cada bolão tem um painel de arquivos (Painel → Bolões → abrir o bolão → **Comprovantes e jogos registrados**) e a tela de registrar aposta aceita o arquivo direto.

- **Tipos:** comprovante da aposta, jogos registrados (volante/recibo da lotérica), recibo de cota (por pessoa), outro.
- **Formatos:** PDF, PNG, JPG e WEBP. O tipo é conferido pelo conteúdo do arquivo, não pelo nome. Tamanho máximo: `UPLOAD_MAX_MB` (padrão 10, teto 50).
- **Registrar aposta:** só libera com o arquivo enviado (ou o link do comprovante, se preferir). Sem nenhum dos dois, o sistema avisa.
- **Quem vê:** equipe (admin e operação) vê tudo e liga/desliga a visibilidade. Só o **admin** apaga. Participante vê os arquivos do bolão onde tem cota paga/registrada e o recibo da própria cota (Minha conta → Meus comprovantes). A página pública do bolão mostra só a lista (nome, tipo, data), nunca o caminho do arquivo.
- **Segurança:** hash SHA-256 por arquivo (mostrado no painel e no download), arquivo repetido no mesmo bolão é recusado, nome sanitizado, download com `no-store` e `nosniff`. O último comprovante de um bolão já registrado não pode ser apagado.
- **Auditoria:** `anexo.enviado`, `anexo.alterado`, `anexo.removido`.
- **Prazo de resgate:** a página do bolão apurado avisa o prazo de 90 dias a partir da apuração.

### Onde ficam os arquivos (IMPORTANTE)
No disco do servidor, em `UPLOAD_DIR` (padrão `/data/uploads`). No Coolify/docker-compose isso é o volume **`uploads_data`** — mantenha-o como volume persistente, senão os arquivos somem a cada deploy. O serviço de backup já inclui os arquivos (`bl-arquivos-AAAAMMDD-HHMM.tar.gz`) junto com o banco.

## 2. Painel "Conexões" (admin)
Menu **Conexões**: mostra em linguagem simples se cada peça está ligada — E-mail, Pagamentos, Sorteios da CAIXA, Alertas, Banco, Arquivos e Segurança. Tem botão **Enviar e-mail de teste** e **Testar alerta**. Nunca mostra senhas.

### Ligar o e-mail (SMTP)
Defina no Coolify (serviço `api`):

```
SMTP_HOST=smtp.seudominio.com.br
SMTP_PORT=587          # 465 se usar SMTP_SECURE=true
SMTP_SECURE=false
SMTP_USER=usuario
SMTP_PASS=senha-ou-chave
MAIL_FROM="Bolão Livre <nao-responder@seudominio.com.br>"
APP_PUBLIC_URL=https://bl.buscarr.com.br
```
Reinicie a API, abra **Conexões** e clique em **Enviar e-mail de teste**. Se falhar, a tela explica o motivo em português (senha errada, porta bloqueada, servidor não encontrado…).

## 3. Jogo responsável (conta do cliente)
Minha conta → **Jogo responsável**:
- **Limite de gasto por mês** (mês de Brasília). Definir ou **baixar** vale na hora. **Subir ou tirar** só vale 24 h depois.
- **Pausa** de 30, 60 ou 90 dias (não encurta) ou sem prazo (só o suporte reverte, direto no banco: `UPDATE usuarios SET pausa_permanente=false WHERE email='...'`).
- A trava roda antes de reservar a cota. Reserva vencida não conta no gasto.
- Auditoria: `conta.pausa`, `conta.limite`.

## Migrações novas
`0013_anexos` e `0014_jogo_responsavel` — aditivas, rodam sozinhas no deploy (`prisma migrate deploy`).
