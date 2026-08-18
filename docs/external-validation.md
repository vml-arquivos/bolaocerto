# Validação externa da integração Caixa

A especificação cita `https://servicebus2.caixa.gov.br/portaldeloterias/api/{modalidade}` como fonte primária. A busca externa encontrou referências públicas que descrevem esse endpoint e a página oficial de Loterias Caixa, mas a consulta direta realizada em 18 de agosto de 2026 no ambiente de execução retornou HTTP 403 (`Azion - Default error page`).

Fonte consultada diretamente: https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena

Decisão de implementação: o sincronizador usa a URL configurável `CAIXA_API_BASE_URL`, timeout, user-agent, tratamento de erro e fallback opcional por `CAIXA_FALLBACK_BASE_URL`; ele não inventa concursos quando a fonte está indisponível. O job só persiste dados que retornarem de uma fonte configurada e registra `fonteSincronizacao` como `caixa` ou `fallback`.
