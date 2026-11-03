import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';

type Tx = Prisma.TransactionClient;

const slugify = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'grupo';

/** Garante que o afiliado tenha ao menos um grupo (o "grupo do afiliado" onde entram os cotistas dele). */
export async function ensureAffiliateGroup(tx: Tx, affiliate: { id: string; usuarioId: string }, userName: string, actorId?: string) {
  const existing = await tx.grupo.findFirst({ where: { afiliadoId: affiliate.id }, orderBy: { criadoEm: 'asc' } });
  if (existing) return existing;
  const first = userName.trim().split(/\s+/)[0] ?? 'Afiliado';
  const group = await tx.grupo.create({
    data: { nome: `Grupo de ${first}`, slug: `${slugify(first)}-${randomBytes(3).toString('hex')}`, tipo: 'afiliado', afiliadoId: affiliate.id, criadoPor: actorId ?? affiliate.usuarioId },
  });
  // O próprio afiliado também conta como pessoa do grupo.
  await tx.grupoMembro.upsert({ where: { grupoId_usuarioId: { grupoId: group.id, usuarioId: affiliate.usuarioId } }, create: { grupoId: group.id, usuarioId: affiliate.usuarioId }, update: {} });
  return group;
}

type GroupRef = { id: string; nome: string; afiliado: { usuarioId: string } | null };

/** Entra no grupo e, se for gente nova, avisa o dono do grupo (o afiliado). */
async function addMember(tx: Tx, group: GroupRef, userId: string) {
  const exists = await tx.grupoMembro.findUnique({ where: { grupoId_usuarioId: { grupoId: group.id, usuarioId: userId } }, select: { id: true } });
  if (exists) return;
  await tx.grupoMembro.create({ data: { grupoId: group.id, usuarioId: userId } });
  const owner = group.afiliado?.usuarioId;
  if (!owner || owner === userId) return;
  const person = await tx.usuario.findUnique({ where: { id: userId }, select: { nome: true } });
  const first = (person?.nome ?? 'Uma pessoa').trim().split(/\s+/)[0];
  await tx.notificacao.create({ data: { usuarioId: owner, canal: 'push', tipo: 'grupo.novo_membro', payload: { titulo: 'Nova pessoa no seu grupo', mensagem: `${first} entrou no grupo ${group.nome}.`, link: '/afiliado' } } });
}

/** Coloca o cotista no grupo principal do afiliado que o trouxe (o mais antigo). Não faz nada se o afiliado ainda não tem grupo. */
export async function joinAffiliateGroup(tx: Tx, affiliateId: string, userId: string) {
  const group = await tx.grupo.findFirst({ where: { afiliadoId: affiliateId }, orderBy: { criadoEm: 'asc' }, select: { id: true, nome: true, afiliado: { select: { usuarioId: true } } } });
  if (!group) return null;
  await addMember(tx, group, userId);
  return group.id;
}

/** Coloca o cotista num grupo específico (ex.: o grupo do bolão que ele comprou). */
export async function joinGroup(tx: Tx, groupId: string, userId: string) {
  const group = await tx.grupo.findUnique({ where: { id: groupId }, select: { id: true, nome: true, afiliado: { select: { usuarioId: true } } } });
  if (group) await addMember(tx, group, userId);
}
