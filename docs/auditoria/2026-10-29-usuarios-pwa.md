# Revisão 4 — Gestão de usuários e aplicativo PWA

Pacote cumulativo, preparado sobre a revisão 3 (commit local f77364b). Não houve alteração no site em produção, envio real de e-mail, remoção de contas reais ou escrita no GitHub nesta etapa.

## Administração de contas

Em **Contas → Ver / editar**, o administrador pode:

- Consultar o cadastro, situação de acesso, papel e quantidade de participações/bolões.
- Editar nome, e-mail, telefone e nascimento, com validação de e-mail, maioridade e duplicidade no banco.
- Enviar instruções de redefinição para o e-mail salvo da conta. O sistema não mostra nem permite consultar a senha. Se o campo de e-mail foi alterado na tela, é necessário salvar primeiro.
- Remover o acesso da conta de forma reversível. A conta sai da listagem padrão de ativos; pode ser encontrada pelo filtro **Acesso removido** ou **Todas as contas**, e reativada.

**Remover acesso não é apagar o histórico ou eliminar dados pessoais.** Cotas, pagamentos, contratos, atribuições e documentos continuam vinculados ao mesmo usuário. O CPF e os dados históricos de compras não são reescritos pela edição de contato. A eliminação/anônimização por LGPD depende da análise de retenção e do processo de atendimento já existente.

Contas de administrador não podem remover seu próprio acesso. A ação administrativa é conferida novamente dentro da transação, sob bloqueio compartilhado com a mudança de papel; isso evita que administradores que já perderam o acesso concluam outra desativação enfileirada. A edição de e-mail revoga as sessões e os links antigos de redefinição. Senha, CPF, papel e tokenVersion não são aceitos pela rota de edição do perfil; alteração de papel continua na rota específica já existente.

A remoção e a reativação incrementam a versão de sessão e invalidam links de senha. Login, renovação e acesso autenticado agora verificam a desativação. Todas as categorias, inclusive cotistas e afiliados, passam pela verificação de revogação no banco; antes ela só era aplicada a administradores/operação. O custo adicional é uma consulta por chave primária por chamada autenticada, que precisa ser dimensionada no teste de carga.

## Redefinição de senha

A nova ação administrativa é `POST /api/v1/admin/usuarios/:id/reenviar-senha`. Ela envia pelo SMTP configurado um token aleatório com validade de 60 minutos e uso único. O banco guarda apenas o hash; nem token nem senha são retornados nessa rota ou incluídos na auditoria. Limite de três solicitações por hora por conta nessa ação. O fluxo antigo de suporte para geração de link permanece separado para compatibilidade.

SMTP ausente/falha retorna erro explícito, sem informar falsamente que o envio foi concluído. Um token cujo envio falhou é invalidado. Sucesso significa aceitação pelo servidor SMTP, não confirmação de leitura nem garantia de entrega na caixa de entrada. Conta desativada não recebe nova senha por esta ação e não pode recuperar acesso usando um link anterior.

## Rotas

| Método | Rota (prefixo `/api/v1`) | Ação |
| --- | --- | --- |
| GET | `/admin/usuarios/:id` | Detalhe com campos permitidos e CPF mascarado |
| PATCH | `/admin/usuarios/:id` | Editar dados cadastrais |
| DELETE | `/admin/usuarios/:id` | Remover acesso preservando histórico |
| POST | `/admin/usuarios/:id/reativar` | Reativar a conta |
| POST | `/admin/usuarios/:id/reenviar-senha` | Enviar instruções por e-mail |

As rotas exigem administrador, validam UUIDs e usam auditoria para alterações. A interface mantém as ações de papel e criação existentes.

## PWA para o cotista

- Entrada dedicada `/aplicativo`, com catálogo real do mesmo backend do site. Não há uma segunda carteira, conta ou sistema de compras.
- Navegação inferior em telas pequenas e modo instalado: bolões, minhas cotas/pagamentos, resultados, contratos e mais serviços. A navegação não é exibida nas áreas administrativas/de operação.
- `/aplicativo/mais` reúne documentos, privacidade, jogo responsável, comprovantes e acesso à conta.
- `/instalar` apresenta instalação no Android e iPhone/iPad; também é acessível pelo rodapé.
- Manifesto com identidade estável `/`, abertura em `standalone`, entrada `/aplicativo?origem=pwa`, ícones existentes de 192/512 pixels e atalhos para as áreas do cliente. A identidade antiga é preservada para evitar criar um aplicativo com identidade diferente ao atualizar.
- Android/Chromium usa o evento de instalação quando o navegador disponibiliza. No iPhone/iPad, a interface orienta abrir no Safari e usar Compartilhar → Adicionar à Tela de Início, mantendo “Abrir como App” quando presente. O usuário precisa confirmar a instalação; não há instalação automática nem distribuição pela App Store/Google Play nesta entrega.
- Respeito às áreas seguras da tela e espaço para a navegação inferior. O painel administrativo preserva sua navegação própria.
- A conta consulta o servidor a cada 30 segundos, ao recuperar conexão e ao voltar à janela, preservando estado de formulários/componentes. Falhas indicam que os dados mostrados são da última consulta. Cada participação tem acesso ao detalhe do bolão/resultado.

## Offline, pagamentos e atualizações

O service worker nunca armazena respostas da API, navegação de páginas privadas, pagamentos ou contratos. Só recursos estáticos públicos são guardados, com limite de cache. A camada de proxy também marca respostas API como privadas e `no-store`.

Sem internet, o aplicativo informa a indisponibilidade. Não enfileira compras, não confirma pagamentos offline e não apresenta uma página de conta salva por outro usuário. A tela de compra bloqueia tentativas quando o navegador informa ausência de conexão; a API continua sendo a autoridade para reserva e pagamento. Uma perda de conexão no meio de uma operação exige conferir a conta antes de repetir, pois o servidor pode já ter recebido o pedido.

Uma nova versão aguarda confirmação antes de ativar e recarregar. O usuário é orientado a concluir compras/edições, inclusive em outras abas, antes de atualizar. Caches de outros aplicativos da mesma origem não são apagados. A atualização de versão do worker é necessária quando o conteúdo offline pré-carregado mudar.

Não foram adicionados Web Push nativo, biometria, acesso offline a documentos pessoais nem cobrança em segundo plano. Os avisos de conta e e-mails transacionais continuam usando os serviços existentes.

## Migração e implantação

1. Backup verificável do banco e dos arquivos. Homologue com a mesma versão de PostgreSQL usada em produção.
2. Aplique as migrações anteriores e `20261029020000_user_access`. A nova coluna `usuarios.desativado_em` nasce nula: nenhuma conta é desativada pela migração. Índice adicionado para a listagem por situação de acesso.
3. Atualize API e frontend juntos. Execute `pnpm db:generate`, `pnpm db:migrate` e `pnpm build` conforme o fluxo do ambiente.
4. Mantenha HTTPS e `/sw.js` servido sem cache, com escopo `/`. Não configure CDN para guardar respostas autenticadas ou `/api/`.
5. Configure/teste o SMTP. As configurações e a aprovação dos contratos exigidas pela revisão 3 continuam necessárias para novas compras; esta entrega não as remove.
6. Teste remover/reabrir conta, e-mail duplicado, idade inválida, sessão antiga, mudança de papel e restauração. Confira que registros financeiros não mudam.
7. Em Android real: instalar, abrir pelo ícone, entrar, comprar em modo de teste, consultar pagamento, comprovante, contrato e resultado; sair e entrar com outra conta. Em iPhone real: repetir pelo Safari e pelo ícone instalado. A persistência da sessão no navegador e no aplicativo instalado pode variar; teste ambos.
8. Corte a conexão, recupere-a e simule nova versão enquanto um checkout está aberto. Confirme que não há recarga automática nem repetição de cobrança.

## Validação e limites

- API: 315 testes unitários passaram, incluindo edição, revogação de cotistas/afiliados, reativação, controle administrativo e falhas de e-mail.
- Frontend: 14 testes passaram, incluindo cinco testes de comportamento do service worker (privacidade de cache, navegação offline e ativação explícita).
- HTTP/Nest: 20 testes passaram; cinco novos validam autorização, DTO, UUID, campos proibidos e rotas administrativas.
- TypeScript aprovado nos workspaces; build de produção concluído. A conferência HTTP do PWA e da vitrine está em `apps/web/scripts/storefront-smoke.cjs`.
- Não foi executada migração na base real, teste SMTP real, pagamento real ou instalação física em Android/iOS. Os testes de serviço usam adaptadores de banco simulados. A suíte PostgreSQL descartável permanece disponível no CI, mas não foi executada aqui.
- Não há garantia absoluta de ausência de regressões. Os resultados acima delimitam o que foi verificado; mantenha homologação e plano de reversão. A revisão anterior continua documentando as pendências financeiras, jurídicas e de modalidades especiais.

## Documentação técnica consultada

- WebKit, comportamento de apps na tela de início: https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
- Apple, instalação via Safari: https://support.apple.com/en-eg/guide/iphone/iphea86e5236/ios
- Google/web.dev, solicitação de instalação: https://web.dev/learn/pwa/installation-prompt
- MDN, `beforeinstallprompt`: https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event

Os critérios e a interface de instalação dependem do navegador e da versão do sistema; o aplicativo fornece caminhos alternativos quando não existe um evento de instalação disponível.

Conferência HTTP final aprovada: catálogo e histórico anteriores, manifesto servido, ícones PNG 192×192 e 512×512, orientação de instalação, navegação do cliente, metadados de web app emitidos pelo Next e respostas API sem armazenamento. Esse teste verifica respostas renderizadas com API simulada; não executa gestos de instalação nem substitui teste visual em aparelho.
