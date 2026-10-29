import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { recoverAdmin } from '../auth/admin-recovery';

async function main() {
  if (!process.argv.includes('--apply')) throw new Error('Use --apply para recuperar explicitamente o administrador. Nunca execute na inicialização.');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL ausente no serviço da API.');
  let password = '';
  for await (const chunk of process.stdin) {
    password += chunk.toString();
    if (Buffer.byteLength(password) > 1024) throw new Error('Entrada excede o limite.');
  }
  // Shell printf sends the exact password, without trimming spaces or adding a newline.
  const prisma = new PrismaClient();
  try {
    await recoverAdmin(prisma, process.env.RECOVERY_ADMIN_EMAIL ?? '', password);
    console.log('Senha atualizada, bloqueio por tentativas removido e sessões revogadas. O segundo fator foi preservado. Entre com a nova senha.');
  } finally { password = ''; await prisma.$disconnect(); }
}
main().catch(error => {
  // Do not print Prisma errors containing connection details or query parameters.
  console.error(error instanceof Error && error.constructor === Error ? error.message : 'Recuperação falhou. Verifique conexão e migrações do banco da API. Nenhuma confirmação de alteração.');
  process.exitCode = 1;
});
