# Revisão 5 — login, exclusão e acessos

## Diagnóstico confirmado no código

ADMIN_BOOTSTRAP_PASSWORD é usado apenas na criação inicial. O seed faz upsert com update de papel, sem atualizar senha. Redeploy e mudança dessa variável não redefinem uma conta existente. Não alteramos esse comportamento para evitar sobrescrever senhas a cada implantação.

A troca autenticada de senha não zerava tentativasLogin/bloqueadoAte; agora zera ambos, como já fazia a redefinição por link. Hash inválido também passa a retornar erro de credencial em vez de exceção interna. Não houve acesso ao banco/servidor de produção: isso não comprova a causa específica do incidente. E-mail, banco conectado, migrações pendentes e bloqueios precisam ser conferidos no ambiente real.

## Recuperação imediata no servidor da API

Se o e-mail de recuperação funciona, use /esqueci-senha e abra o último link recebido. A redefinição por link já remove o bloqueio por tentativas. Não compartilhe senha, hash, DATABASE_URL nem tokens em mensagens.

Após publicar esta revisão, abra um terminal Bash **no serviço/container da API**, no diretório apps/api (onde existem dist e node_modules), usando o mesmo DATABASE_URL da API. Não execute no frontend nem em um banco de desenvolvimento. O comando é manual, único, nunca deve entrar no startup/redeploy.

```bash
read -r -p 'E-mail do administrador existente: ' RECOVERY_ADMIN_EMAIL
export RECOVERY_ADMIN_EMAIL
read -r -s -p 'Nova senha (12 a 128 caracteres): ' BL_RECOVERY_SECRET
printf '\n'
printf '%s' "$BL_RECOVERY_SECRET" | node dist/tools/recover-admin.js --apply
unset BL_RECOVERY_SECRET RECOVERY_ADMIN_EMAIL
```

O comando não imprime a senha, não a recebe em argumentos e não usa ADMIN_BOOTSTRAP_PASSWORD. Recupera somente administrador existente e ativo; não cria usuário, não promove cliente e não desliga 2FA. Invalida sessões e links de senha e registra auditoria. Se houver 2FA, o código do autenticador continuará necessário. Uma falha em qualquer etapa do banco reverte a transação. Conta desativada exige reativação por outro administrador.

Se a senha redefinida continuar falhando, confira se o frontend aponta para a mesma API/banco em que a redefinição foi feita. Guarde horário e status HTTP da tentativa; não registre o corpo com credenciais. Erro 500 por coluna inexistente exige aplicar as migrações da revisão anterior; não deve ser tratado como senha incorreta.

## Usuários, equipe e acessos

O menu e a página agora identificam explicitamente a gestão de usuários e acessos. Cada registro abre Editar / acessos / excluir. O modal contém cadastro, envio de redefinição, seletor de perfil com confirmação, remoção/reativação de acesso e exclusão definitiva de conta vazia.

Perfis mantidos: cotista, afiliado, operacao e admin. Não foi introduzido um sistema de permissões arbitrárias por checkbox: as autorizações continuam nas rotas da API. Trocar perfil revoga sessões. Administrador não pode remover o próprio acesso nem rebaixar a si mesmo. A operação de alteração exige administrador ativo conferido sob lock.

DELETE /admin/usuarios/:id mantém a desativação compatível com a revisão anterior. DELETE /admin/usuarios/:id/definitivo é novo: exige conta desativada, não permite autoexclusão e bloqueia qualquer relação de histórico (inclusive cancelamentos, auditorias como autor, contratos, afiliado e CRM). Apenas tokens de redefinição podem ser eliminados em cascata. A exclusão ocorre com lock de linha, lock administrativo e isolamento Serializable, sendo auditada sem copiar dados pessoais. Conflitos de concorrência abortam a exclusão; o cliente deve atualizar e tentar novamente. Não excluímos registros reais durante os testes.

## Implantação e validação

Esta revisão não adiciona migração. Requer todas as migrações anteriores, em especial 20261029020000_user_access. Fazer backup antes da atualização. Nunca executar migrate reset em produção.

Testes automatizados cobrem senha/bloqueio, recuperação com Argon2, preservação de 2FA, restrições de recuperação, exclusão protegida, papéis HTTP e fluxos anteriores. Testes com mocks não substituem a validação contra PostgreSQL e o teste de login no domínio real. Sem certificação de ausência absoluta de regressões.

Validação local concluída em 29/10/2026: 321 testes da API, 14 testes web e 20 testes HTTP aprovados; lint TypeScript, build completo e smoke HTTP da vitrine/PWA aprovados. Banco real, SMTP e autenticação em produção não foram acessados.
