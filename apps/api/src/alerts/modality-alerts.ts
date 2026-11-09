import { Logger } from '@nestjs/common';

const logger = new Logger('AlertasModalidade');

interface Db {
  alertaModalidade: { findMany: (args: unknown) => Promise<Array<{ usuarioId: string }>> };
  notificacao: { createMany: (args: unknown) => Promise<unknown> };
}

const money = (value: unknown) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Avisa quem pediu "avise-me" quando um bolão OFICIAL da modalidade é publicado.
 * Bolão de grupo de afiliado não entra (é vendido só por link). Falha aqui nunca atrapalha a publicação.
 */
export async function notifyModalityWatchers(db: unknown, pool: { id: string; modalidade: string; nomeModalidade: string; numeroConcurso: number; valorCota: unknown; grupoTipo: string; criadoPor?: string | null }): Promise<number> {
  try {
    if (pool.grupoTipo !== 'oficial') return 0;
    const client = db as Db;
    const watchers = await client.alertaModalidade.findMany({ where: { modalidade: pool.modalidade, usuario: { desativadoEm: null, papel: { in: ['cotista', 'afiliado'] } } }, select: { usuarioId: true }, take: 5000 });
    const targets = watchers.filter((row) => row.usuarioId !== pool.criadoPor);
    if (!targets.length) return 0;
    const payload = { titulo: `Novo bolão de ${pool.nomeModalidade}`, mensagem: `Concurso ${pool.numeroConcurso} aberto: cota a partir de ${money(pool.valorCota)}. Garanta a sua.`, link: `/boloes/${pool.id}` };
    for (let i = 0; i < targets.length; i += 500) {
      await client.notificacao.createMany({ data: targets.slice(i, i + 500).map((row) => ({ usuarioId: row.usuarioId, canal: 'push', tipo: 'bolao.novo', payload })) });
    }
    return targets.length;
  } catch (error) {
    logger.warn(`Não foi possível avisar os interessados: ${error instanceof Error ? error.message : String(error)}`);
    return 0;
  }
}
