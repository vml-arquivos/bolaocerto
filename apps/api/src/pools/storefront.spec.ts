import { Prisma } from '@prisma/client';
import { PoolsService } from './pools.service';
const base = (extra: object = {}) => ({ id: 'p1', status: 'aberto', numerosApostados: [1,2,3,4,5,6], jogos: [], valorCota: new Prisma.Decimal(6), taxaAdministracaoPct: new Prisma.Decimal(0), totalCotas: 10, cotasVendidas: 1, cotasIlimitadas: false, ...extra });
function setup(rows: any[]) {
  const findMany = jest.fn().mockResolvedValue(rows);
  return { findMany, service: new PoolsService({ bolao: { findMany, fields: { cotasVendidas: 'field-reference' } } } as never, {} as never) };
}
describe('Separate sales storefront and public history', () => {
  it('requires an open contest, future cutoff and no result in the database query', async () => {
    const { service, findMany } = setup([base()]);
    await service.listAvailable();
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'aberto', concurso: { status: 'aberto', cutoffAt: { gt: expect.any(Date) }, resultado: { is: null } }, OR: [{ cotasIlimitadas:true }, { totalCotas:{ gt:'field-reference' } }] } }));
  });
  it('excludes sold out and invalid finite capacity, retaining unlimited and available pools', async () => {
    const { service } = setup([base({id:'sold',cotasVendidas:10}),base({id:'unknown',totalCotas:null}),base({id:'available'}),base({id:'unlimited',cotasIlimitadas:true,totalCotas:null})]);
    expect((await service.listAvailable()).map(p=>p.id)).toEqual(['available','unlimited']);
  });
  it('publishes official draw independently of registering or settling the pool', async () => {
    const { service, findMany } = setup([base({ concurso: { modalidade:'duplasena', status:'apurado', resultado: { numerosSorteados:[1,2,3,4,5,6], numerosSegundoSorteio:[7,8,9,10,11,12], apuradoEm:new Date() } } })]);
    const result = await service.listHistory();
    expect(result[0]?.resultado?.numerosSegundoSorteio).toEqual([7,8,9,10,11,12]);
    expect(result[0]?.transparencia).toBeNull();
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({ status: { in: ['aberto','fechado','registrado','apurado'] }, OR:expect.any(Array) }),take:50}));
  });
  it('keeps an explicit waiting state instead of inventing a drawn result', async () => {
    const { service } = setup([base({ concurso: { modalidade:'megasena', status:'fechado', resultado:null } })]);
    expect((await service.listHistory())[0]?.resultado).toBeNull();
  });
});
