import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth.utils';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';

export type AudienceKind = 'todos' | 'cotistas' | 'afiliados' | 'bolao' | 'grupo' | 'com_aviso_no_celular';
export interface CommunicationInput { publico: AudienceKind; bolaoId?: string; grupoId?: string; titulo: string; mensagem: string; link?: string; enviarEmail?: boolean }

const MAX_RECIPIENTS = 20_000;
const ACTIVE_SHARE_STATUS = ['reservada', 'paga', 'registrada', 'apurada', 'premiada'] as const;

/** Mensagens da equipe para os clientes: aviso no sino da conta, aviso no celular/PWA e, se marcado, e-mail. */
@Injectable()
export class CommunicationsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async audienceWhere(input: Pick<CommunicationInput, 'publico' | 'bolaoId' | 'grupoId'>): Promise<Prisma.UsuarioWhereInput> {
    const active: Prisma.UsuarioWhereInput = { desativadoEm: null };
    switch (input.publico) {
      case 'todos': return { ...active, papel: { in: ['cotista', 'afiliado'] } };
      case 'cotistas': return { ...active, papel: 'cotista' };
      case 'afiliados': return { ...active, papel: 'afiliado' };
      case 'com_aviso_no_celular': return { ...active, pushInscricoes: { some: {} } };
      case 'bolao': {
        if (!input.bolaoId) throw new BadRequestException('Escolha o bolão.');
        const pool = await this.prisma.bolao.findUnique({ where: { id: input.bolaoId }, select: { id: true } });
        if (!pool) throw new BadRequestException('Bolão não encontrado.');
        return { ...active, cotasCompradas: { some: { bolaoId: input.bolaoId, status: { in: [...ACTIVE_SHARE_STATUS] } } } };
      }
      case 'grupo': {
        if (!input.grupoId) throw new BadRequestException('Escolha o grupo.');
        const group = await this.prisma.grupo.findUnique({ where: { id: input.grupoId }, select: { id: true } });
        if (!group) throw new BadRequestException('Grupo não encontrado.');
        return { ...active, gruposMembro: { some: { grupoId: input.grupoId } } };
      }
      default: throw new BadRequestException('Público inválido.');
    }
  }

  /** Quantas pessoas vão receber e quantas delas têm aviso no celular ligado. */
  async preview(input: Pick<CommunicationInput, 'publico' | 'bolaoId' | 'grupoId'>) {
    const where = await this.audienceWhere(input);
    const [total, comAviso] = await Promise.all([
      this.prisma.usuario.count({ where }),
      this.prisma.usuario.count({ where: { AND: [where, { pushInscricoes: { some: {} } }] } }),
    ]);
    return { total, comAvisoNoCelular: comAviso };
  }

  async send(input: CommunicationInput, actor: AuthUser) {
    const titulo = input.titulo.trim();
    const mensagem = input.mensagem.trim();
    if (titulo.length < 3 || mensagem.length < 3) throw new BadRequestException('Escreva o título e a mensagem.');
    if (input.link && !/^\/[A-Za-z0-9/_\-?=&%.#]*$/.test(input.link)) throw new BadRequestException('O link deve começar com "/" (ex.: /minha-conta).');
    const where = await this.audienceWhere(input);
    const users = await this.prisma.usuario.findMany({ where, select: { id: true }, take: MAX_RECIPIENTS + 1 });
    if (!users.length) throw new BadRequestException('Ninguém se encaixa nesse público.');
    if (users.length > MAX_RECIPIENTS) throw new BadRequestException(`Esse público passa de ${MAX_RECIPIENTS} pessoas. Escolha um grupo menor.`);
    const link = input.link || '/minha-conta';
    const communication = await this.prisma.comunicado.create({ data: { titulo, mensagem, link, publico: input.publico, bolaoId: input.bolaoId, grupoId: input.grupoId, enviarEmail: Boolean(input.enviarEmail), totalDestinatarios: users.length, criadoPor: actor.id } });
    const payload = { titulo, mensagem, link, comunicadoId: communication.id, semEmail: !input.enviarEmail } as Prisma.InputJsonValue;
    for (let i = 0; i < users.length; i += 500) {
      await this.prisma.notificacao.createMany({ data: users.slice(i, i + 500).map((user) => ({ usuarioId: user.id, canal: 'push', tipo: 'comunicado', payload })) });
    }
    await this.audit.record(this.prisma, { entidade: 'comunicado', entidadeId: communication.id, evento: 'comunicado.enviado', atorId: actor.id, payloadDepois: { publico: input.publico, destinatarios: users.length, enviarEmail: Boolean(input.enviarEmail), titulo } as unknown as Prisma.InputJsonValue });
    return { id: communication.id, destinatarios: users.length, mensagem: 'Mensagem enviada. Os avisos saem em poucos minutos.' };
  }

  async list() {
    return this.prisma.comunicado.findMany({ orderBy: { criadoEm: 'desc' }, take: 30 });
  }
}
