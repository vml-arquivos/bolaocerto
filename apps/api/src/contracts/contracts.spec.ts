import { buildContractPdf } from './contract-pdf';
import { affiliateContractText, bonusAddendumText, companyHash, DEFAULT_COMPANY, longDate, numberInWords, sanitizeCompany, textHash, type AffiliateParty } from './contract-templates';
import { addressLine, cleanDevice, ContractsService, maskEmail } from './contracts.service';

const party: AffiliateParty = { nome: 'Maria da Silva', cpf: '52998224725', email: 'maria@exemplo.com', telefone: '61999998888', dataNascimento: new Date('1990-05-10T12:00:00Z'), endereco: 'Rua A, nº 10, Centro, Brasília/DF, CEP 70.000-000', codigoAfiliado: 'BLX123', comissaoPct: '35.00' };
const date = new Date('2026-11-19T15:00:00Z');

describe('modelos de contrato', () => {
  it('contrato principal sai preenchido com a empresa, o representante e o afiliado, sem campos em aberto', () => {
    const text = affiliateContractText({ kind: 'afiliado', numero: 'BLC-20261119-ABCDE', company: DEFAULT_COMPANY, affiliate: party, date });
    expect(text).toContain('Contrato nº BLC-20261119-ABCDE');
    expect(text).toContain('SORTE TECH SERVIÇOS DIGITAIS LTDA');
    expect(text).toContain('65.265.592/0001-19');
    expect(text).toContain('NIRE 53203684617');
    expect(text).toContain('CARLOS DEL VECCHIO BERALDO VIEIRA');
    expect(text).toContain('167.127.301-04');
    expect(text).toContain('942709 SSP/DF');
    expect(text).toContain('Cláusula Sexta do Contrato Social');
    expect(text).toContain('MARIA DA SILVA, inscrito(a) no CPF sob o nº 529.982.247-25');
    expect(text).toContain('nascido(a) em 10/05/1990');
    expect(text).toContain('residente e domiciliado(a) em Rua A, nº 10');
    expect(text).toContain('(61) 99999-8888');
    expect(text).toContain('código de afiliado BLX123');
    expect(text).toContain('é de 35% (por cento)');
    expect(text).toContain('30 (trinta) dias');
    expect(text).toContain('Foro da Comarca de Brasília/DF');
    expect(text).toContain('Medida Provisória nº 2.200-2/2001');
    expect(text).toContain('Brasília/DF, 19 de novembro de 2026.');
    expect(text).not.toMatch(/\[X\]|XXXX|000\.000\.000-00|Testemunha|duas vias/);
  });

  it('sem endereço no cadastro, usa o endereço informado na plataforma; sem comissão, remete ao painel', () => {
    const text = affiliateContractText({ kind: 'afiliado', numero: 'N', company: DEFAULT_COMPANY, affiliate: { ...party, endereco: null, dataNascimento: null, telefone: null, comissaoPct: null }, date });
    expect(text).toContain('com endereço informado em seu cadastro na plataforma');
    expect(text).toContain('é o informado em seu painel na plataforma');
    expect(text).not.toContain('nascido(a)');
  });

  it('aditivo usa a razão social correta, cita o contrato principal e tem a cláusula de assinatura eletrônica', () => {
    const text = bonusAddendumText({ kind: 'aditivo-bonificacao', numero: 'BLA-1', company: DEFAULT_COMPANY, affiliate: party, date, mainContract: { numero: 'BLC-20261119-ABCDE', data: date } });
    expect(text).not.toMatch(/SORTH|Brasilia\/DF\]|novará/);
    expect(text).toContain('Contrato de Parceria Comercial e Afiliação nº BLC-20261119-ABCDE, de 19/11/2026');
    expect(text).toContain('CLÁUSULA DÉCIMA QUINTA – DA CONTRATAÇÃO ELETRÔNICA E DA VALIDADE JURÍDICA');
    expect(text).toContain('15.2. A assinatura do AFILIADO');
    expect(text).toContain('no prazo estabelecido na Cláusula Sexta');
    expect(text).toContain('DIAMANTE — de 81 bolões em diante — 35%');
  });

  it('hash da empresa muda quando os dados mudam; campos vazios voltam ao padrão', () => {
    expect(companyHash(DEFAULT_COMPANY)).toBe(companyHash(sanitizeCompany({})));
    expect(companyHash(sanitizeCompany({ representanteNome: 'OUTRA PESSOA' }))).not.toBe(companyHash(DEFAULT_COMPANY));
    expect(sanitizeCompany({ razaoSocial: '  ', prazoAvisoDias: 0 })).toEqual(DEFAULT_COMPANY);
    expect(sanitizeCompany({ prazoAvisoDias: 45 }).prazoAvisoDias).toBe(45);
  });

  it('números e datas por extenso', () => {
    expect(numberInWords(30)).toBe('trinta');
    expect(numberInWords(45)).toBe('quarenta e cinco');
    expect(numberInWords(100)).toBe('cem');
    expect(numberInWords(120)).toBe('cento e vinte');
    expect(longDate(new Date('2026-01-01T02:00:00Z'))).toBe('31 de dezembro de 2025');
  });
});

describe('apoio', () => {
  it('mascara e-mail, monta endereço e limpa a localização do aparelho', () => {
    expect(maskEmail('maria@exemplo.com')).toBe('m***a@exemplo.com');
    expect(maskEmail('jo@x.com')).toBe('j*@x.com');
    expect(addressLine({ enderecoLogradouro: 'Rua A', enderecoNumero: '10', enderecoBairro: 'Centro', enderecoCidade: 'Brasília', enderecoUf: 'df', enderecoCep: '70000000' })).toBe('Rua A, nº 10, Centro, Brasília/DF, CEP 70.000-000');
    expect(addressLine({ enderecoLogradouro: null, enderecoCidade: 'Brasília' })).toBeNull();
    expect(cleanDevice({ latitude: -15.7801234567, longitude: -47.9292, precisao: 12.4, fuso: 'America/Sao_Paulo' })).toEqual({ latitude: -15.780123, longitude: -47.9292, precisaoMetros: 12, fuso: 'America/Sao_Paulo' });
    expect(cleanDevice({ localNegado: true })).toEqual({ localizacao: 'não autorizada no aparelho' });
    expect(cleanDevice(undefined)).toEqual({ localizacao: 'não informada pelo aparelho' });
  });

  it('gera o PDF com o texto e o certificado', async () => {
    const texto = affiliateContractText({ kind: 'afiliado', numero: 'BLC-1', company: DEFAULT_COMPANY, affiliate: party, date });
    const pdf = await buildContractPdf({ numero: 'BLC-1', titulo: 'Contrato', texto, hash: textHash(texto), status: 'assinado', blocks: [{ title: 'Documento', rows: [['Número', 'BLC-1']] }], verifyUrl: 'https://bolaolivre.com/verificar-contrato', footer: 'SORTE TECH' });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(5000);
  });
});

/** Banco em memória com o mínimo usado pelo serviço. */
function fakeDb() {
  const contratos: Array<Record<string, any>> = [];
  const config = new Map<string, string>();
  const matches = (row: Record<string, any>, where: Record<string, any> = {}) => Object.entries(where).every(([key, cond]) => {
    if (key === 'OR' || key === 'afiliado') return true;
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('in' in cond) return cond.in.includes(row[key]);
      if ('not' in cond) return row[key] !== cond.not;
      return true;
    }
    return row[key] === cond;
  });
  const user = { id: 'u1', nome: 'Maria da Silva', cpf: '52998224725', email: 'maria@exemplo.com', telefone: '61999998888', dataNascimento: null, enderecoLogradouro: 'Rua A', enderecoNumero: '10', enderecoComplemento: null, enderecoBairro: 'Centro', enderecoCidade: 'Brasília', enderecoUf: 'DF', enderecoCep: '70000000' };
  const affiliate = { id: 'a1', usuarioId: 'u1', codigoAfiliado: 'BLX123', comissaoPadraoPct: 20, criadoEm: new Date(), usuario: user };
  const prisma = {
    contratos,
    configuracaoSistema: {
      findUnique: jest.fn(async ({ where }: any) => (config.has(where.chave) ? { chave: where.chave, valor: config.get(where.chave) } : null)),
      upsert: jest.fn(async ({ where, create }: any) => { config.set(where.chave, create.valor); }),
      deleteMany: jest.fn(async ({ where }: any) => { config.delete(where.chave); }),
    },
    afiliado: {
      findUnique: jest.fn(async ({ where }: any) => (where.id === 'a1' || where.usuarioId === 'u1' ? affiliate : null)),
    },
    usuario: {
      findUnique: jest.fn(async () => user),
      findUniqueOrThrow: jest.fn(async () => user),
    },
    notificacao: { create: jest.fn(async () => ({})) },
    contrato: {
      findFirst: jest.fn(async ({ where }: any) => contratos.find((row) => matches(row, where)) ?? null),
      findMany: jest.fn(async ({ where }: any) => contratos.filter((row) => matches(row, where))),
      findUnique: jest.fn(async ({ where }: any) => contratos.find((row) => (where.id ? row.id === where.id : row.numero === where.numero)) ?? null),
      create: jest.fn(async ({ data }: any) => { const row = { id: `c${contratos.length + 1}`, status: 'aguardando', codigoTentativas: 0, codigoEnvios: 0, codigoHash: null, codigoExpiraEm: null, codigoEnviadoEm: null, assinadoEm: null, empresaAssinadaEm: null, canceladoEm: null, motivoCancelamento: null, criadoEm: new Date(), ...data }; contratos.push(row); return row; }),
      update: jest.fn(async ({ where, data }: any) => { const row = contratos.find((item) => item.id === where.id)!; Object.assign(row, data); return row; }),
      updateMany: jest.fn(async ({ where, data }: any) => { const rows = contratos.filter((row) => matches(row, where)); rows.forEach((row) => Object.assign(row, data)); return { count: rows.length }; }),
    },
  };
  return prisma;
}

describe('serviço de contratos', () => {
  const user = { id: 'u1', email: 'maria@exemplo.com', papel: 'afiliado' as const };
  const meta = { ip: '200.10.20.30', userAgent: 'Mozilla/5.0 Teste', forwardedFor: '200.10.20.30' };

  function setup() {
    const prisma = fakeDb();
    const mail = { send: jest.fn(async (_message: unknown) => true), publicUrl: () => 'https://bolaolivre.com' };
    const audit = { record: jest.fn(async () => undefined) };
    const service = new ContractsService(prisma as any, audit as any, mail as any);
    return { prisma, mail, audit, service };
  }
  const lastCode = (mail: { send: jest.Mock }) => String((mail.send.mock.calls.at(-1)![0] as { text: string }).text.match(/\b(\d{6})\b/)![1]);

  it('ao abrir o app, o afiliado já encontra o contrato preenchido (gerado uma vez só)', async () => {
    const { service, prisma } = setup();
    const first = await service.mine(user);
    expect(first.items).toHaveLength(1);
    expect(first.items[0]).toMatchObject({ tipo: 'afiliado', status: 'aguardando' });
    expect(first.items[0]!.texto).toContain('MARIA DA SILVA');
    expect(first.items[0]!.hash).toBe(textHash(first.items[0]!.texto));
    await service.mine(user);
    expect(prisma.contratos).toHaveLength(1);
  });

  it('assina só com o código certo, registra IP, aparelho e local, e envia a cópia em PDF', async () => {
    const { service, prisma, mail } = setup();
    const { items } = await service.mine(user);
    const id = items[0]!.id;
    await expect(service.sign(user, id, '123456', undefined, meta)).rejects.toThrow('Peça o código');
    const sent = await service.requestCode(user, id, meta);
    expect(sent.email).toBe('m***a@exemplo.com');
    const code = lastCode(mail);
    expect(prisma.contratos[0]!.codigoHash).not.toContain(code);
    await expect(service.requestCode(user, id, meta)).rejects.toThrow('Aguarde 1 minuto');
    const wrong = code === '000000' ? '111111' : '000000';
    await expect(service.sign(user, id, wrong, undefined, meta)).rejects.toThrow('Código incorreto');
    const result = await service.sign(user, id, code, { latitude: -15.79, longitude: -47.88, precisao: 20, fuso: 'America/Sao_Paulo' }, meta);
    expect(result.status).toBe('assinado');
    const row = prisma.contratos[0]!;
    expect(row.status).toBe('assinado');
    expect(row.assinatura).toMatchObject({ ip: '200.10.20.30', userAgent: 'Mozilla/5.0 Teste', latitude: -15.79, longitude: -47.88, precisaoMetros: 20, cpf: '529.982.247-25', hash: row.hash });
    expect(row.eventos.map((event: { evento: string }) => event.evento)).toEqual(['gerado', 'codigo_enviado', 'codigo_incorreto', 'assinado']);
    const copy = mail.send.mock.calls.at(-1)![0] as unknown as { attachments: Array<{ filename: string; content: Buffer }> };
    expect(copy.attachments[0]!.filename).toBe(`${row.numero}.pdf`);
    expect(copy.attachments[0]!.content.subarray(0, 4).toString()).toBe('%PDF');
    await expect(service.sign(user, id, code, undefined, meta)).rejects.toThrow('já está assinado');
  });

  it('depois de 5 erros o código deixa de valer', async () => {
    const { service, prisma, mail } = setup();
    const { items } = await service.mine(user);
    await service.requestCode(user, items[0]!.id, meta);
    const code = lastCode(mail);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i += 1) await expect(service.sign(user, items[0]!.id, wrong, undefined, meta)).rejects.toThrow('Código incorreto');
    await expect(service.sign(user, items[0]!.id, wrong, undefined, meta)).rejects.toThrow('Peça um novo código');
    expect(prisma.contratos[0]!.codigoHash).toBeNull();
    await expect(service.sign(user, items[0]!.id, code, undefined, meta)).rejects.toThrow('Peça o código');
  });

  it('assinatura da empresa: o representante aprova o modelo com código e os contratos pendentes recebem a assinatura', async () => {
    const { service, prisma, mail } = setup();
    await service.mine(user);
    expect(prisma.contratos[0]!.empresaAssinadaEm).toBeNull();
    const admin = { id: 'u1', email: 'maria@exemplo.com', papel: 'admin' as const };
    await service.sendCompanyCode(admin);
    await expect(service.approveCompany(admin, '999999' === lastCode(mail) ? '888888' : '999999', undefined, meta)).rejects.toThrow('Código incorreto');
    const result = await service.approveCompany(admin, lastCode(mail), { localNegado: true }, meta);
    expect(result.aprovacao).toMatchObject({ ip: '200.10.20.30', hash: result.hash });
    expect(result.contratosAtualizados).toBe(1);
    expect(prisma.contratos[0]!.empresaAssinadaEm).toBeInstanceOf(Date);
    // Novo contrato já nasce com a assinatura da empresa.
    const addendum = await service.create('a1', 'aditivo-bonificacao', { origem: 'painel', actorId: 'admin' });
    expect(addendum.empresaAssinadaEm).toBeInstanceOf(Date);
    expect(addendum.texto).toContain(`nº ${prisma.contratos[0]!.numero}`);
    // Mudou o dado da empresa: a aprovação deixa de valer para os próximos.
    const changed = await service.saveCompany(admin, { ...DEFAULT_COMPANY, prazoAvisoDias: 60 });
    expect(changed.aprovacao).toBeNull();
    expect(changed.aprovacaoAnterior).not.toBeNull();
  });

  it('painel não gera um segundo contrato do mesmo tipo aguardando; cancelar libera gerar outro', async () => {
    const { service } = setup();
    const admin = { id: 'adm', email: 'adm@x.com', papel: 'admin' as const };
    const first = await service.create('a1', 'afiliado', { origem: 'painel', actorId: 'adm', strict: true });
    await expect(service.create('a1', 'afiliado', { origem: 'painel', actorId: 'adm', strict: true })).rejects.toThrow('aguardando assinatura');
    await service.cancel(first.id, admin, 'Dados errados');
    const second = await service.create('a1', 'afiliado', { origem: 'painel', actorId: 'adm', strict: true });
    expect(second.id).not.toBe(first.id);
  });

  it('verificação pública confere número e código sem expor dados pessoais', async () => {
    const { service } = setup();
    const { items } = await service.mine(user);
    const row = items[0]!;
    expect(await service.verify(row.numero, 'f'.repeat(64))).toEqual({ valido: false });
    const ok = await service.verify(row.numero.toLowerCase(), row.hash);
    expect(ok).toMatchObject({ valido: true, numero: row.numero, afiliado: 'Maria S.' });
    expect(JSON.stringify(ok)).not.toContain('529');
  });
});
