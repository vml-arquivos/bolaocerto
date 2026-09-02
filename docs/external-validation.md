# Validação externa da integração Caixa

A especificação cita `https://servicebus2.caixa.gov.br/portaldeloterias/api/{modalidade}` como fonte primária. A busca externa encontrou referências públicas que descrevem esse endpoint e a página oficial de Loterias Caixa, mas a consulta direta realizada em 18 de agosto de 2026 no ambiente de execução retornou HTTP 403 (`Azion - Default error page`).

Fonte consultada diretamente: https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena

Decisão de implementação: o sincronizador usa a URL configurável `CAIXA_API_BASE_URL`, timeout, user-agent, tratamento de erro e fallback opcional por `CAIXA_FALLBACK_BASE_URL`; ele não inventa concursos quando a fonte está indisponível. O job só persiste dados que retornarem de uma fonte configurada e registra `fonteSincronizacao` como `caixa` ou `fallback`.

## Evolução premium — 2026-09-02

O commit `4ea1f903c782e30463966b9bfca18b38b86fda89` (`feat: elevar experiencia premium de loterias`) foi publicado no repositório. O CI GitHub Actions `33599305748` concluiu com sucesso, incluindo instalação congelada, Prisma generate, lint, testes e build.

No Coolify, a aplicação `bolaolivre` está no ambiente `production`, servidor `localhost`. O deployment `uhdlu1tbsrjo6ahovi71gohu` usou o commit `4ea1f90`, concluiu o build web/API/worker, criou o container e terminou com status `Success` após aproximadamente 4 minutos e 15 segundos. O healthcheck efetivo passou e o container está em execução.

URL do deployment: https://coolifycar.casadf.com.br/project/m0lm8noh2uairxrxmhflazfl/environment/n6r05mgih5vsfzjxoephq5at/application/suneq7c8jbdzc5xpet0vjeov/deployment/uhdlu1tbsrjo6ahovi71gohu

A configuração do Coolify ainda exibe o indicador visual de alterações pendentes durante a tela de histórico, mas o deployment correto foi criado com o SHA completo e finalizado com sucesso; isso não impediu a publicação da imagem validada.
