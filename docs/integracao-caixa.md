# Integração com a CAIXA (atualização automática dos concursos)

O worker consulta a API de resultados da CAIXA a cada 5 minutos e grava o concurso apurado, os rateios e o próximo concurso. A API usa o mesmo cliente no botão **Concursos → Sincronizar agora**.

## Variáveis (runtime, no Coolify)

| Variável | Padrão | Para que serve |
|---|---|---|
| `CAIXA_API_BASE_URL` | `https://servicebus2.caixa.gov.br/portaldeloterias/api` | Fonte oficial. |
| `CAIXA_API_TIMEOUT_MS` | `15000` | Tempo limite por consulta (máx. 60000). Se aparecer "tempo esgotado", use 20000. |
| `CAIXA_FALLBACK_BASE_URL` | vazio | Fonte alternativa, usada só se a CAIXA recusar ou não responder. Aceita várias URLs separadas por vírgula. Sem `{modalidade}` na URL, consulta `<url>/<modalidade>/latest`. |
| `CAIXA_USER_AGENT` | navegador comum | Opcional. |

Os concursos obtidos pela fonte alternativa ficam com `fonteSincronizacao = fallback`; os da CAIXA, `caixa`; os cadastrados à mão, `manual`.

## O que o sistema faz

- Envia cabeçalhos compatíveis com o portal oficial (o firewall da CAIXA recusa clientes sem "cara de navegador").
- Repete uma vez em falhas transitórias (rede, 429, 5xx) e não repete bloqueios (403).
- Se a CAIXA falhar, tenta as fontes alternativas; uma fonte que falhou fica em descanso por 5 minutos para não atrasar o ciclo.
- Uma modalidade com problema não impede as demais.
- Nunca inventa concurso: sem resposta válida, nada é gravado.

## Diagnóstico

No admin, **Concursos → Testar conexão com a CAIXA** consulta as 9 modalidades sem gravar nada e mostra, por modalidade, o erro e a orientação. Nos logs do container, procure `concursos.sincronizacao_falhou` (traz as tentativas) e `worker.iniciado` (mostra as fontes ativas).

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| HTTP 403 / "Azion" | O firewall da CAIXA bloqueia o IP do servidor (comum em datacenter). | Configurar `CAIXA_FALLBACK_BASE_URL`; ou usar servidor com IP do Brasil/saída por proxy brasileiro. Plano B: **Concursos → Cadastrar concurso manualmente**. |
| Falha de certificado (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`) | A CAIXA entrega a cadeia de certificados incompleta. | Baixar o certificado intermediário e apontar `NODE_EXTRA_CA_CERTS` para ele. Não desative a verificação TLS. |
| Falha de DNS (`ENOTFOUND`) | Container sem DNS/saída HTTPS. | Revisar rede e DNS do servidor. |
| Tempo esgotado | CAIXA lenta ou saída bloqueada. | `CAIXA_API_TIMEOUT_MS=20000`. |
| "Resposta não é JSON" | Página de bloqueio ou manutenção. | Tratar como 403. |

## Cuidado com fontes alternativas

Fontes alternativas são serviços de terceiros que republicam os dados da CAIXA, e o resultado delas alimenta a apuração das cotas. Use apenas se aceitar esse risco, confira o resultado de concursos premiados no site oficial e prefira a fonte oficial sempre que possível.
