import { Prisma } from '@prisma/client';
import { ACCOUNT_DOCUMENTS, legalDocument } from './documents';

type Tx = Pick<Prisma.TransactionClient, 'aceiteLegal'>;
export interface AcceptanceMeta { ip?: string; userAgent?: string | null }

/** Termos de uso e política de privacidade (LGPD) vigentes, com o hash do texto que a pessoa viu. */
export function currentAccountDocuments() {
  return ACCOUNT_DOCUMENTS.map((kind) => legalDocument(kind));
}

/** Grava o aceite dos documentos vigentes (idempotente: o mesmo texto não duplica). */
export async function recordAccountAcceptances(tx: Tx, userId: string, meta: AcceptanceMeta) {
  for (const doc of currentAccountDocuments()) {
    await tx.aceiteLegal.upsert({
      where: { usuarioId_tipo_hash: { usuarioId: userId, tipo: doc.tipo, hash: doc.hash } },
      update: {},
      create: { usuarioId: userId, tipo: doc.tipo, hash: doc.hash, versao: doc.versao, texto: doc.texto, ip: meta.ip ?? 'unknown', userAgent: meta.userAgent ?? undefined },
    });
  }
}

/** Documentos vigentes que a pessoa ainda não aceitou (texto novo = novo aceite). */
export async function pendingAccountDocuments(db: Pick<Prisma.TransactionClient, 'aceiteLegal'>, userId: string) {
  const docs = currentAccountDocuments();
  const accepted = await db.aceiteLegal.findMany({ where: { usuarioId: userId, tipo: { in: docs.map((doc) => doc.tipo) }, hash: { in: docs.map((doc) => doc.hash) } }, select: { tipo: true, hash: true } });
  return docs.filter((doc) => !accepted.some((row) => row.tipo === doc.tipo && row.hash === doc.hash));
}
