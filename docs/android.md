# Bolão Livre no Android

Há dois caminhos. O primeiro já funciona com este pacote. O segundo gera o arquivo APK/AAB.

## 1. Instalar direto do site (PWA)

1. No celular, abra `https://SEU-DOMINIO/instalar` no **Chrome**.
2. Toque em **Instalar aplicativo**. Se nada abrir, use o menu ⋮ do Chrome → **Instalar aplicativo**.
3. O Chrome cria o app na tela inicial (ele monta um app de verdade, "WebAPK"). Os avisos (push) funcionam.

Se o botão não aparecer: o site precisa estar em HTTPS, o Chrome atualizado e fora do navegador interno do WhatsApp/Instagram.

## 2. Gerar o APK / AAB (para Google Play ou para baixar)

Usa o PWABuilder (grátis), sem programar:

1. Entre em `pwabuilder.com`, cole o endereço do site e clique em **Package for stores → Android**.
2. Em **Package ID** use `br.com.bolaolivre.app` (depois de publicado, não muda mais).
3. Em **Signing key**, escolha **Create new** e **baixe o arquivo da chave e a senha**. Guarde com cuidado: sem ele não dá para atualizar o app depois.
4. Baixe o pacote. Dentro vêm o `.apk` (para instalar) e o `.aab` (para a Google Play).
5. Na tela do PWABuilder (ou no arquivo `signing-key-info.txt`) copie o **SHA-256 fingerprint**.
6. No Coolify, adicione as variáveis abaixo e faça o Redeploy. Isso tira a barra do Chrome de dentro do app:

```
ANDROID_PACKAGE_NAME=br.com.bolaolivre.app
ANDROID_SHA256_CERT_FINGERPRINTS=COLE_AQUI_O_SHA256
```

7. Confira em `https://SEU-DOMINIO/.well-known/assetlinks.json`: deve mostrar o pacote e o SHA-256.

### Oferecer o download na página /instalar

Depois de ter o arquivo hospedado (por exemplo, em "Releases" do GitHub), adicione no Coolify (opcional):

```
ANDROID_APK_URL=https://link-https-do-apk
ANDROID_PLAY_URL=https://play.google.com/store/apps/details?id=br.com.bolaolivre.app
```

Os botões "Baixar o APK" e "Baixar na Google Play" aparecem sozinhos quando a variável está preenchida.

## Observações

- A Google Play cobra uma taxa única de cadastro de desenvolvedor.
- Apps de bolão/loteria têm regras próprias na Google Play. Leia a política antes de publicar.
- Quando o domínio definitivo mudar, gere o pacote de novo com o novo endereço.

## Dois aplicativos: cliente e painel (BL Admin)

São dois apps separados, cada um com seu ícone, nome e endereço de entrada:

| App | Onde instalar | Ícone | Pacote Android sugerido |
|---|---|---|---|
| Bolão Livre (cliente) | `https://SEU-DOMINIO/instalar` | azul | `br.com.bolaolivre.app` |
| BL Admin (equipe) | `https://SEU-DOMINIO/admin/entrar` | verde com "ADMIN" | `br.com.bolaolivre.admin` |

No PWABuilder, gere um pacote para cada endereço (cliente: o site; painel: `https://SEU-DOMINIO/admin` (ou `https://admin.SEU-DOMINIO/admin` se usar `ADMIN_HOST`)). Cada um tem sua chave de assinatura. As variáveis do painel no Coolify:

```
ANDROID_ADMIN_PACKAGE_NAME=br.com.bolaolivre.admin
ANDROID_ADMIN_SHA256_CERT_FINGERPRINTS=COLE_AQUI_O_SHA256_DO_PAINEL
```

O endereço `/.well-known/assetlinks.json` lista os dois pacotes sozinho.
