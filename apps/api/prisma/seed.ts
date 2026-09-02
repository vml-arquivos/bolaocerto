import 'dotenv/config';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const modalities = [
  ['megasena', 'Mega-Sena', '19:00'],
  ['lotofacil', 'Lotofácil', '19:00'],
  ['quina', 'Quina', '19:00'],
  ['lotomania', 'Lotomania', '19:00'],
  ['duplasena', 'Dupla Sena', '19:00'],
  ['timemania', 'Timemania', '19:00'],
  ['diadesorte', 'Dia de Sorte', '19:00'],
  ['loteca', 'Loteca', '14:00'],
  ['supersete', 'Super Sete', '19:00'],
] as const;

async function main() {
  for (const [modalidade, nomeExibicao, horarioCorteLocal] of modalities) {
    await prisma.configLoteria.upsert({
      where: { modalidade },
      create: { modalidade, nomeExibicao, valorMinimoCota: 1, minCotasBolao: 2, maxCotasBolao: 100, taxaAdministracaoTetoPct: 35, horarioCorteLocal, diasSemanaSorteio: [] },
      update: { nomeExibicao, horarioCorteLocal },
    });
  }

  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  const cpf = process.env.ADMIN_BOOTSTRAP_CPF?.replace(/\D/g, '');
  let adminId: string | undefined;

  if (email && password && cpf?.length === 11) {
    const admin = await prisma.usuario.upsert({
      where: { email },
      create: {
        nome: 'Administrador BL',
        cpf,
        email,
        dataNascimento: new Date('1990-01-01T00:00:00.000Z'),
        senhaHash: await argon2.hash(password, { type: argon2.argon2id }),
        papel: 'admin',
        statusKyc: 'aprovado',
      },
      update: { papel: 'admin' },
    });
    adminId = admin.id;
  }

  await prisma.grupo.upsert({
    where: { slug: 'bl-oficial' },
    create: { nome: 'BL Oficial', slug: 'bl-oficial', tipo: 'oficial', descricao: 'Bolões oficiais administrados pelo BL — Bolão Livre.', criadoPor: adminId },
    update: { nome: 'BL Oficial', descricao: 'Bolões oficiais administrados pelo BL — Bolão Livre.' },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
