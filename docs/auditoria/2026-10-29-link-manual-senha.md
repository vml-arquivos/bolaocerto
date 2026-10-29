# Revisão 6 — link manual de redefinição

No painel: Usuários e acessos → Editar / acessos / excluir → Recuperação de senha → Gerar link de redefinição → Copiar link. Entregue o link somente ao titular; ele abre /redefinir-senha, escolhe e confirma a nova senha e depois entra pelo login. Nenhum SMTP é necessário para gerar ou usar o link.

Link válido por 1 hora e uma utilização; novo link invalida anteriores. Limite de 3 solicitações por usuário/hora, compartilhado com pedidos por e-mail. Apenas administrador ativo pode gerar, somente para conta ativa. Token aleatório de 32 bytes; banco guarda apenas SHA-256. A emissão e auditoria são atômicas sob lock. A auditoria não contém token/link. Resposta HTTP private,no-store. A interface mantém o link apenas em memória enquanto o modal estiver aberto, com alternativa de seleção manual se a área de transferência estiver indisponível. Ocultar o link não o revoga.

A rota existente POST /admin/usuarios/:id/redefinicao-senha foi preservada e reforçada, sem duplicação. O usuário não precisa estar autenticado para usar o link pessoal. A senha atual só muda quando ele conclui a redefinição. Após concluir, sessões anteriores e outros links são revogados e o bloqueio por tentativas é zerado. O segundo fator permanece ativo quando previamente configurado.

## Configuração

Na API, configure APP_PUBLIC_URL=https://bl.buscarr.com.br. Sem endereço correto, o link pode apontar ao domínio errado. Não usar URL da API quando diferente da URL pública do frontend.

O botão Enviar redefinição de senha permanece pronto para uso depois de configurar SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS e MAIL_FROM, conforme .env.example. Reinicie a API depois de alterar variáveis. Sem SMTP, esse botão informa a ausência de configuração; gerar/copiar link continua funcionando. Não há envio retroativo dos links manuais após configurar o SMTP: novas solicitações pelo botão de e-mail enviam um novo link. Nenhum e-mail real foi enviado durante esta implementação.

Esta opção exige acesso ao painel por um administrador. Se todos os administradores estiverem sem acesso, use o procedimento de recuperação no terminal da API documentado na revisão 5; a geração de link não é um acesso alternativo público ao painel.

## Validação

322 testes de API, 14 testes web e 22 testes HTTP aprovados. Incluem geração sem envio de e-mail, uso único, invalidação de link antigo, restrição de conta/perfil, limite e resposta não cacheável. Build e lint verificados. Sem migração nova. SMTP real, PostgreSQL em produção e interação visual no navegador não foram testados. Não publicado no servidor nem no GitHub automaticamente.
