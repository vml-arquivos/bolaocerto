# Identidade visual BL — achados iniciais

Fonte: `assets/brand/LOGOS/Manual_de_Marca_BL.pdf`, páginas 1–5.

## Estrutura da marca

A marca oficial é **BL — Bolão Livre** e o manual apresentado é a versão **"sem verde"**. O sistema de identidade é centrado no **monograma BL** e no **logotipo horizontal "BL Bolão Livre"**.

## Diretrizes visuais observadas

| Elemento | Diretriz identificada |
| --- | --- |
| Marca principal | Monograma **BL** em branco/metalizado sobre fundo em gradiente azul-violeta |
| Ícone de app | Versão quadrada arredondada com o monograma **BL** |
| Header/assinatura | Versão horizontal **BL Bolão Livre** |
| Versão P&B | Variante preta sobre fundo claro e branca sobre fundo escuro |
| Tom da marca | Visual tecnológico, sólido, limpo, institucional e moderno |

## Essência da marca

| Pilar | Interpretação prática |
| --- | --- |
| Segurança | Visual sólido, contraste limpo e uso consistente |
| Tecnologia | Gradientes modernos, tipografia limpa, sensação de app/plataforma |
| Praticidade | Marca legível em tamanhos pequenos e em contextos digitais |

## Regras de uso observadas

| Aplicação | Regra |
| --- | --- |
| Área de proteção | Espaço livre equivalente a aproximadamente **1/3 da altura do “B”** |
| Ícone/avatar | Mínimo recomendado **128 px**, ideal **512 px** |
| Feed/post | Largura mínima aproximada **400 px** para o monograma |
| Horizontal/header | Largura mínima aproximada **600 px** |

## Implicações para o projeto

A personalização deve priorizar o **logotipo horizontal** no cabeçalho e rodapé do web, o **ícone quadrado** para favicon/app icon e o **monograma** como elemento de destaque em áreas institucionais. A paleta deve migrar para uma base de **azul elétrico / azul profundo / violeta**, evitando verde como cor primária da marca.

## Arquivos extraídos

| Arquivo | Uso provável |
| --- | --- |
| `Logo moderno em fundo azul vibrante.png` | Marca principal para hero, apresentações e materiais institucionais |
| `Logo moderno em fundo azul vibrante (2).png` | Variante principal alternativa |
| `Ícone digital com letras _BL_.png` | App icon, favicon, avatar, loaders |
| `Logo moderno em preto e branco.png` | Aplicações monocromáticas |
| `Logo digital em preto e branco.png` | Variante monocromática alternativa |
| `COPA DO MUNDO/LOGO COPA DO MUNDO.png` | Campanha temática, não deve substituir a marca base do produto |
| `COPA DO MUNDO/POST WHATSAPP.png` | Referência de peça promocional, não de UI base |
| `COPA DO MUNDO/STORIES DO INSTAGRAM E WPP.png` | Referência de peça promocional, não de UI base |

## Decisão operacional

Para o produto principal, a identidade base a aplicar deve ser a do **manual BL padrão**, não a campanha **Copa do Mundo**.

## Assets selecionados para implementação

A variante horizontal `Logo moderno em fundo azul vibrante (2).png` apresenta o logotipo completo **BL Bolão Livre** em branco sobre gradiente azul-violeta e será usada em superfícies de marca com fundo azul, como hero e materiais institucionais. O arquivo `Ícone digital com letras _BL_.png` apresenta o monograma **BL** em um quadrado arredondado azul-violeta sobre fundo claro e será usado como favicon, ícone compacto, splash/app icon e marca de navegação responsiva.

As imagens fornecidas têm fundo incorporado; a integração deve preservar o enquadramento e não aplicar `object-fit: cover` em locais que cortem a marca. Para cabeçalho claro, a variante monocromática será preferida se o logotipo horizontal colorido não tiver contraste adequado.

## Seleção de contraste

A variante `Logo moderno em preto e branco.png` é um monograma preto em canvas claro e funciona melhor sobre superfícies brancas. A variante `Logo digital em preto e branco.png` é o logotipo horizontal completo preto sobre fundo claro e será usada quando for necessário manter o header/rodapé claros com contraste institucional. O monograma colorido com fundo arredondado continua reservado para favicon, app icon e pontos compactos.

## Smoke test visual local

O build local renderizou corretamente a marca no cabeçalho, rodapé, painel de destaque da home e fluxo de autenticação. O cabeçalho usa o ícone BL oficial, o painel de destaque usa o logotipo horizontal sobre azul-violeta e a tela de login mantém contraste alto com o painel institucional em azul profundo. A página continua responsiva no layout desktop observado e os estados sem dados/erro continuam legíveis.

## Comparação com o APK entregue

O APK anexado foi inspecionado passivamente, sem execução. Ele representa outro artefato/configuração em relação ao monorepositório atual: display name `Bolão Livre`, slug `Bolao_Livre`, versão `1.1.2`, scheme `bolaolivre`, pacote Android `com.jacksondev.bolao_livre`, Expo SDK 54, `expo-router`, ícone em `./assets/images/icon.png`, splash próprio e bundle que referencia `https://bolaolivre.com/api/v1`.

O monorepositório atual permanece com slug técnico `bolaocerto`, scheme `bolaocerto`, pacote `br.bolaocerto.app`, Expo SDK 53 e entrada `App.tsx`. Para evitar retrabalho e não quebrar deep links, o código-fonte atual foi personalizado com a identidade fornecida e o ícone oficial, mas não foi substituído silenciosamente pelo bundle do APK. A diferença de pacote/scheme/SDK deve ser tratada como decisão de release independente, não como simples troca de logo.
