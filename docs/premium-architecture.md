# Arquitetura premium do BL — Bolão Livre

## Objetivo

Transformar o BL em uma vitrine clara e premium para acompanhar concursos, resultados, modalidades de loteria, bolões abertos e cotas disponíveis, preservando os fluxos atuais de autenticação, reserva, pagamento e área do cotista.

## Referência de experiência

A organização foi inspirada em padrões públicos observados em plataformas de loteria online: navegação por modalidades, destaque para próximos concursos, filtros por preço/modalidade, cards com cotas disponíveis, detalhe do bolão, resultados e conteúdo explicativo. A implementação do BL deve manter código, identidade, textos e assets próprios.

## Navegação pública

| Rota | Função |
| --- | --- |
| `/` | Hero, concurso em destaque, modalidades, bolões recomendados, próximos concursos, confiança e como funciona |
| `/#concursos` | Calendário de próximos concursos e estados do prêmio |
| `/#boloes` | Catálogo público de bolões com cotas disponíveis |
| `/boloes/[id]` | Detalhe premium do bolão, composição da aposta, cotas, transparência e reserva |
| `/login` e `/cadastro` | Entrada e criação de conta com identidade BL consistente |
| `/minha-conta` | Participações, comprovantes, prêmios e status das cotas |

## Composição da home

A home deve ser formada por um hero de alto contraste com CTA primário e concurso em destaque, uma faixa de indicadores, um seletor visual de modalidades, uma seção de bolões recomendados, uma seção de próximos concursos, um bloco explicativo sobre cotas e uma área final de confiança, jogo responsável e independência da plataforma.

Os cards de modalidade devem usar ilustrações próprias ou licenciadas em estilo premium, com cor de acento específica apenas no hero visual da modalidade. Prêmio, concurso, data, horário e estado devem permanecer como texto HTML acessível e nunca depender da leitura da imagem.

## Contratos públicos usados

O frontend pode usar os endpoints já existentes: `GET /boloes`, `GET /boloes/:id`, `GET /concursos`, `GET /concursos/:id` e `GET /concursos/:id/resultado`. O catálogo público de bolões já entrega modalidade, concurso, prêmio estimado, cotas totais/disponíveis, valor da cota, taxa, modelo operacional, status, números apostados, grupo e indicação de ganhador.

O próximo concurso é filtrado no frontend pela data de corte e ordenado pelo prêmio estimado. Resultados detalhados são carregados sob demanda na página de concurso ou em componente dedicado, evitando ampliar a API sem necessidade.

## Regras de produto

Nunca mostrar pagamento como disponível quando o ambiente estiver desabilitado. A reserva deve continuar exigindo sessão, quantidade válida, CPF, nome titular e aceite do termo de mandato. Bolões fechados, sem cotas ou fora do cutoff devem aparecer com estado informativo e CTA desabilitado/alternativo, não como compra ativa.

Todo valor monetário deve ser formatado em pt-BR. Datas e horários devem usar o fuso `America/Sao_Paulo`. A interface deve informar que o BL é uma plataforma independente, não oficial da CAIXA, e incluir jogo responsável e acesso 18+.

## Direção visual

Usar azul elétrico, azul profundo, violeta e lavanda do Manual de Marca BL. A estrutura das imagens de referência será reinterpretada como cards com topo visual colorido, bolas e elementos da modalidade, painel branco de dados, CTA com gradiente BL e rodapé de confiança. Logo oficial, tipografia, navegação, botões, estados, foco e acessibilidade permanecem unificados pelo design system BL.
