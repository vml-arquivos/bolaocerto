# Aplicativos instaláveis: cliente e painel

O sistema tem **dois PWAs**, instaláveis ao mesmo tempo no mesmo aparelho.

| | Cliente | Painel (BL Admin) |
|---|---|---|
| Manifesto | `/manifest.webmanifest` | `/admin/manifest.webmanifest` |
| `id` / escopo | `/` | `/admin` |
| Abre em | `/aplicativo` | `/admin` |
| Login | `/login` | `/admin/entrar` (só admin e operação; outras contas são recusadas e saem) |
| Ícone | azul "BL" | verde "BL ADMIN" |
| Botão de instalar | `/instalar`, aviso no rodapé | menu lateral do painel e `/admin/entrar` |
| Barra de baixo | sim (celular) | não (menu lateral) |

Pontos que importam:
- O botão "Instalar" usa o instalador do navegador (Chrome/Edge, Android e computador). No iPhone mostra o passo a passo (Compartilhar → Adicionar à Tela de Início).
- O service worker (`/sw.js`) é um só e não guarda páginas de conta, pagamento ou painel. Só imagens e arquivos estáticos.
- Quando sai versão nova, aparece o aviso "Atualizar aplicativo" (também no painel).
- Se a sessão do painel expira, o app volta para `/admin/entrar` e continua dentro do app.
- Os links "Ver o site" e "Minha conta" do painel saem do app (abrem no navegador).

## Senha

Regra para criar ou trocar senha: no mínimo 6 caracteres, com pelo menos uma letra e um número (sem máximo prático; limite técnico de 128). Contas antigas com senha só de números continuam entrando; a regra vale na próxima troca. O botão "Mostrar" aparece nos campos de senha.

## Perfis de acesso

Administrador altera o perfil em Usuários e acessos → Editar: cliente, afiliado, equipe de operação ou administrador. A troca encerra as sessões da pessoa. O administrador não pode tirar o próprio acesso.

## Painel em endereço próprio (subdomínio)

Para o painel ficar em `admin.seudominio.com.br` e o site dos clientes no endereço principal:

1. No DNS, crie um registro `admin` apontando para o mesmo servidor do site.
2. No Coolify, no serviço do **web**, adicione o segundo domínio (`https://admin.seudominio.com.br`) junto do principal.
3. No Coolify, crie a variável `ADMIN_HOST=admin.seudominio.com.br` e faça o deploy.

O que acontece: o endereço do painel abre direto em `/admin`; qualquer página de cliente nele volta para `/admin`; e `/admin` no site principal redireciona para o endereço do painel. Sem `ADMIN_HOST`, nada muda. Cada endereço tem seu próprio login e seu próprio app instalado.

Android: gere o app do painel no PWABuilder com o endereço `https://admin.seudominio.com.br/admin`. O `assetlinks.json` é servido nos dois endereços.
