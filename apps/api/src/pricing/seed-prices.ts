import { PrismaClient } from '@prisma/client';
import { officialPriceRows } from './pricing.engine';
const prisma = new PrismaClient();
async function main() {
  // Verification date, NOT a claim of historical effective date. Never rewrite past pools.
  const date = new Date('2026-10-29T00:00:00Z');
  await prisma.$transaction(async tx => {
    for (const row of officialPriceRows()) await tx.precoLoteria.upsert({
      where: { modalidade_chave_vigenteDesde: { modalidade: row.modalidade, chave: row.chave, vigenteDesde: date } },
      create: { ...row, vigenteDesde: date, verificadoEm: date }, update: {},
    });
  });
}
main().finally(() => prisma.$disconnect());
