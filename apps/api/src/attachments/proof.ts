import { PrismaService } from '../common/prisma.service';

/** Tipos de arquivo que comprovam a aposta feita na CAIXA. */
export const PROOF_TYPES = ['comprovante_aposta', 'jogos_registrados'] as const;

/** Há ao menos um comprovante em arquivo (não removido) para este bolão? */
export async function hasProofFile(client: Pick<PrismaService, 'anexo'>, poolId: string): Promise<boolean> {
  return (await client.anexo.count({ where: { bolaoId: poolId, removidoEm: null, tipo: { in: [...PROOF_TYPES] } } })) > 0;
}
