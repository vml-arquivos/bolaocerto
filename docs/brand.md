# Identidade visual — BL — Bolão Livre

A interface do projeto usa a identidade oficial fornecida no **Manual de Marca BL — Bolão Livre**, versão sem verde. A marca deve ser aplicada com foco em segurança, tecnologia e praticidade, mantendo contraste limpo, respiro ao redor do logotipo e consistência entre web, mobile e materiais de produto.

## Direção visual

A paleta de produto é liderada por **azul elétrico**, **azul profundo** e **violeta**, com superfícies claras em lavanda muito suave. O verde não é usado como cor primária da interface. Cores semânticas de estados podem existir somente quando necessárias para comunicar sucesso, erro ou uma categoria de domínio.

| Token | Valor | Uso |
| --- | --- | --- |
| `--blue` | `#3157ee` | CTAs, foco, estados ativos e progressos |
| `--blue-dark` | `#2540c6` | Links, textos de destaque e overlines |
| `--violet` | `#4b35e8` | Gradientes e acentos de marca |
| `--navy` | `#111a45` | Títulos, navegação escura e superfícies institucionais |
| `--soft` | `#f4f6ff` | Fundos suaves de seção e dashboard |
| `--line` | `#dfe4f5` | Bordas e divisórias |

## Assets oficiais

| Asset | Local no produto | Uso |
| --- | --- | --- |
| `bl-app-icon.png` | `apps/web/public/brand/`, `apps/web/app/icon.png`, `apps/mobile/assets/brand/` | Favicon, app icon, cabeçalho, rodapé e marca compacta |
| `bl-logo-horizontal-color.png` | `apps/web/public/brand/` | Painel de destaque e superfícies com fundo azul |
| `bl-logo-horizontal-mono.png` | `apps/web/public/brand/` | Aplicações claras institucionais e documentos |
| `bl-monogram-mono.png` | `apps/web/public/brand/` | Aplicações monocromáticas específicas |
| `Manual_de_Marca_BL.pdf` | `assets/brand/LOGOS/` | Fonte de referência da identidade |

## Regras de implementação

No web, o cabeçalho e as telas de autenticação usam o ícone oficial com texto HTML para manter leitura, acessibilidade e responsividade. O painel institucional da home usa o logotipo horizontal colorido sem cortar o nome da marca. O favicon e os metadados do Next apontam para o ícone oficial.

No mobile, o nome visível é **BL — Bolão Livre**, o ícone oficial é configurado no Expo para iOS e Android e a tela inicial usa os mesmos tokens cromáticos da versão web. O slug técnico `bolaocerto` é preservado para não quebrar deep links ou referências existentes.

A área de campanha **Copa do Mundo** permanece como material promocional separado e não substitui a identidade base do produto.
