# E-mail (Brevo) e troca de domínio

## Brevo SMTP
1. Crie a conta em brevo.com e, em **SMTP & API → SMTP**, copie o **Login SMTP** (algo como `xxxx@smtp-brevo.com`) e crie uma **Chave SMTP**. Não é a senha da conta nem a chave de API.
2. Em **Remetentes e domínios**, valide o seu domínio e publique no DNS os registros que a Brevo mostrar (SPF, DKIM e DMARC). Sem isso os e-mails caem no spam ou são recusados.
3. No Coolify (API), configure:
   - `SMTP_HOST=smtp-relay.brevo.com`
   - `SMTP_PORT=587`
   - `SMTP_SECURE=false`
   - `SMTP_USER=<Login SMTP>`
   - `SMTP_PASS=<Chave SMTP>`
   - `MAIL_FROM=BL - Bolão Livre <contato@seudominio.com.br>` (o remetente precisa estar validado na Brevo)
4. Em Admin → Conexões, use "Testar e-mail". O painel mostra o provedor detectado e explica o erro, se houver.

## Trocar de domínio (próxima rodada)
Nada de domínio está escrito no código. Ao mudar, atualize só as variáveis:
- `WEB_ORIGIN` (origem permitida no CORS), `PUBLIC_API_URL`, `APP_PUBLIC_URL`;
- cadastre de novo o webhook da Cora no endereço novo;
- no app: `EXPO_PUBLIC_API_URL`;
- DNS do domínio novo (A/CNAME para o servidor) e SPF/DKIM/DMARC da Brevo para o domínio de envio.
