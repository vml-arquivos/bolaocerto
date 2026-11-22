import { buildContractPdf } from './contract-pdf';
import { affiliateContractText, bonusAddendumText, companyHash, DEFAULT_COMPANY, longDate, numberInWords, sanitizeCompany, textHash, type AffiliateParty } from './contract-templates';
import { addressLine, cleanDevice, ContractsService, maskEmail } from './contracts.service';
import { missingFields, readExtra, rgIssuer } from './contract-data';
import { icpInfo, signPdfWithCompanyCertificate } from './contract-icp';
import { combinedFound, detectFileType, documentSituation, sanitizeReading, type IdentityDoc } from './identity-document';

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
  const affiliate: Record<string, any> = { id: 'a1', usuarioId: 'u1', codigoAfiliado: 'BLX123', comissaoPadraoPct: 20, criadoEm: new Date(), dadosContrato: null, documentoIdentidade: null, usuario: user };
  const prisma: Record<string, any> = {
    contratos,
    configuracaoSistema: {
      findUnique: jest.fn(async ({ where }: any) => (config.has(where.chave) ? { chave: where.chave, valor: config.get(where.chave) } : null)),
      upsert: jest.fn(async ({ where, create }: any) => { config.set(where.chave, create.valor); }),
      deleteMany: jest.fn(async ({ where }: any) => { config.delete(where.chave); }),
    },
    afiliado: {
      findUnique: jest.fn(async ({ where }: any) => (where.id === 'a1' || where.usuarioId === 'u1' ? affiliate : null)),
      findUniqueOrThrow: jest.fn(async () => affiliate),
      update: jest.fn(async ({ data }: any) => Object.assign(affiliate, data)),
    },
    usuario: {
      findUnique: jest.fn(async () => user),
      findUniqueOrThrow: jest.fn(async () => user),
      update: jest.fn(async ({ data }: any) => Object.assign(user, data)),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
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
    const documents = { forAffiliate: jest.fn(async () => null) };
    const service = new ContractsService(prisma as any, audit as any, mail as any, documents as any);
    return { prisma, mail, audit, service };
  }
  const complete = { dataNascimento: '1990-05-10', rg: '1234567', rgOrgao: 'SSP', rgUf: 'DF', nacionalidade: 'brasileira', estadoCivil: 'solteiro(a)', profissao: 'Vendedora' };
  const lastCode = (mail: { send: jest.Mock }) => String((mail.send.mock.calls.at(-1)![0] as { text: string }).text.match(/\b(\d{6})\b/)![1]);

  it('ao abrir o app, o afiliado já encontra o contrato e o aditivo preenchidos (gerados uma vez só)', async () => {
    const { service, prisma } = setup();
    const first = await service.mine(user);
    expect(first.items).toHaveLength(2);
    expect(first.items.map((item) => item.tipo)).toEqual(['afiliado', 'aditivo-bonificacao']);
    expect(first.items[0]).toMatchObject({ tipo: 'afiliado', status: 'aguardando' });
    expect(first.items[0]!.texto).toContain('MARIA DA SILVA');
    expect(first.items[0]!.hash).toBe(textHash(first.items[0]!.texto));
    expect(first.items[1]!.texto).toContain(`nº ${first.items[0]!.numero}`);
    expect(first.dados.completo).toBe(false);
    expect(first.dados.faltando.map((item) => item.campo)).toEqual(['dataNascimento', 'rg', 'rgOrgao', 'nacionalidade', 'estadoCivil', 'profissao']);
    await service.mine(user);
    expect(prisma.contratos).toHaveLength(2);
  });

  it('sem os dados completos não dá para pedir o código; ao completar, os textos são refeitos com RG, estado civil e profissão', async () => {
    const { service, prisma } = setup();
    await service.mine(user);
    const oldHash = prisma.contratos[0]!.hash;
    await expect(service.requestCodeAll(user, meta)).rejects.toThrow('Complete seus dados');
    await expect(service.saveContractData(user, { ...complete, estadoCivil: 'enrolado' })).rejects.toThrow('estado civil');
    await expect(service.saveContractData(user, { ...complete, dataNascimento: '2015-01-01' })).rejects.toThrow('18 anos');
    const saved = await service.saveContractData(user, complete);
    expect(saved.completo).toBe(true);
    expect(saved.refeitos).toBe(2);
    expect(prisma.contratos[0]!.numero).toMatch(/^BLC-/);
    expect(prisma.contratos[0]!.hash).not.toBe(oldHash);
    expect(prisma.contratos[0]!.hash).toBe(textHash(prisma.contratos[0]!.texto));
    expect(prisma.contratos[0]!.texto).toContain('MARIA DA SILVA, brasileira, solteiro(a), vendedora, portador(a) da cédula de identidade nº 1234567 SSP/DF, inscrito(a) no CPF');
    expect(prisma.contratos[1]!.texto).toContain('nascido(a) em 10/05/1990');
    expect(prisma.contratos[0]!.eventos.map((event: { evento: string }) => event.evento)).toContain('dados_atualizados');
  });

  it('um só código assina o contrato e o aditivo: duas assinaturas, um e-mail com os dois PDFs', async () => {
    const { service, prisma, mail } = setup();
    await service.mine(user);
    await service.saveContractData(user, complete);
    const sent = await service.requestCodeAll(user, meta);
    expect(sent.documentos).toBe(2);
    const code = lastCode(mail);
    await expect(service.requestCodeAll(user, meta)).rejects.toThrow('Aguarde 1 minuto');
    const wrong = code === '000000' ? '111111' : '000000';
    await expect(service.signAll(user, wrong, undefined, meta)).rejects.toThrow('Código incorreto. Você ainda tem 4');
    const result = await service.signAll(user, code, { latitude: -15.79, longitude: -47.88, fuso: 'America/Sao_Paulo' }, meta);
    expect(result.documentos).toHaveLength(2);
    expect(prisma.contratos.map((row: any) => row.status)).toEqual(['assinado', 'assinado']);
    for (const row of prisma.contratos as any[]) expect(row.assinatura).toMatchObject({ ip: '200.10.20.30', hash: row.hash, latitude: -15.79 });
    expect(prisma.contratos[0]!.assinatura).not.toBe(prisma.contratos[1]!.assinatura);
    const copy = mail.send.mock.calls.at(-1)![0] as unknown as { subject: string; attachments: Array<{ filename: string }> };
    expect(copy.subject).toBe('Contrato e aditivo assinados');
    expect(copy.attachments.map((item) => item.filename)).toEqual(prisma.contratos.map((row: any) => `${row.numero}.pdf`));
    await expect(service.signAll(user, code, undefined, meta)).rejects.toThrow('Não há documentos');
  });

  it('assina só com o código certo, registra IP, aparelho e local, e envia a cópia em PDF', async () => {
    const { service, prisma, mail } = setup();
    const { items } = await service.mine(user);
    await service.saveContractData(user, complete);
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
    expect(row.eventos.map((event: { evento: string }) => event.evento)).toEqual(['gerado', 'dados_atualizados', 'codigo_enviado', 'codigo_incorreto', 'assinado']);
    const copy = mail.send.mock.calls.at(-1)![0] as unknown as { attachments: Array<{ filename: string; content: Buffer }> };
    expect(copy.attachments[0]!.filename).toBe(`${row.numero}.pdf`);
    expect(copy.attachments[0]!.content.subarray(0, 4).toString()).toBe('%PDF');
    await expect(service.sign(user, id, code, undefined, meta)).rejects.toThrow('já está assinado');
  });

  it('depois de 5 erros o código deixa de valer', async () => {
    const { service, prisma, mail } = setup();
    const { items } = await service.mine(user);
    await service.saveContractData(user, complete);
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
    expect(result.contratosAtualizados).toBe(2);
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

describe('dados para o contrato', () => {
  const base = { nome: 'Maria da Silva', cpf: '52998224725', email: 'm@x.com', telefone: '61999998888', dataNascimento: new Date('1990-01-01'), enderecoCep: '70000000', enderecoLogradouro: 'Rua A', enderecoNumero: '10', enderecoComplemento: null, enderecoBairro: 'Centro', enderecoCidade: 'Brasília', enderecoUf: 'DF' };
  it('aponta o que falta e monta o órgão emissor', () => {
    const extra = readExtra({ rg: '123456', rgOrgao: 'ssp', rgUf: 'df', nacionalidade: 'brasileira', estadoCivil: 'casado(a)', profissao: 'Autônomo', lixo: '<script>' });
    expect(missingFields(base, extra)).toEqual([]);
    expect(rgIssuer(extra)).toBe('SSP/DF');
    expect(rgIssuer({ rgOrgao: 'SSP/DF', rgUf: 'DF' })).toBe('SSP/DF');
    expect(missingFields({ ...base, cpf: '11111111111', telefone: '123', enderecoUf: 'XX' }, {})).toEqual(expect.arrayContaining(['cpf', 'telefone', 'enderecoUf', 'rg', 'profissao']));
  });
});

describe('documento de identidade', () => {
  it('reconhece o tipo pelo conteúdo e recusa o que não é imagem nem PDF', () => {
    expect(detectFileType(Buffer.from('ffd8ffe000104a4649460001', 'hex'))).toEqual({ ext: 'jpg', mime: 'image/jpeg' });
    expect(detectFileType(Buffer.from('89504e470d0a1a0a0000000d', 'hex'))?.ext).toBe('png');
    expect(detectFileType(Buffer.concat([Buffer.from('000000186674797068656963', 'hex')]))?.ext).toBe('heic');
    expect(detectFileType(Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj'))?.mime).toBe('application/pdf');
    expect(detectFileType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(detectFileType(Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00'))).toBeNull();
  });

  it('guarda só números e sim/não da leitura feita no aparelho', () => {
    const reading = sanitizeReading(JSON.stringify({ automatica: true, legivel: true, motivo: '<b>ok</b>', largura: 2000, altura: 1200, nitidez: 350.123, brilho: 900, confianca: 81, achou: { nome: true, cpf: 'sim', rg: false }, texto: 'CPF 529' }));
    expect(reading).toEqual({ automatica: true, legivel: true, motivo: 'bok/b', largura: 2000, altura: 1200, nitidez: 350.12, brilho: 255, confianca: 81, achou: { nome: true, cpf: null, rg: false, nascimento: null } });
    expect(sanitizeReading('{quebrado')).toBeNull();
  });

  it('situação: falta verso, em análise, conferido e revisão da administração', () => {
    const file = (achou: Record<string, boolean>, ext = 'jpg') => ({ chave: 'k', mime: 'image/jpeg', ext, nome: 'f', bytes: 1, enviadoEm: '', leitura: { automatica: true, legivel: true, motivo: null, largura: 1, altura: 1, nitidez: 1, brilho: 1, confianca: 1, achou: { nome: null, cpf: null, rg: null, nascimento: null, ...achou } } });
    expect(documentSituation({})).toBe('pendente');
    expect(documentSituation({ frente: file({ nome: true }) })).toBe('incompleto');
    expect(documentSituation({ frente: file({ nome: true, cpf: true, rg: true, nascimento: true }, 'pdf') })).toBe('conferido');
    const both: IdentityDoc = { frente: file({ nome: true, nascimento: true }), verso: file({ cpf: true, rg: true, nome: false }) };
    expect(combinedFound(both)).toEqual({ nome: true, cpf: true, rg: true, nascimento: true });
    expect(documentSituation(both)).toBe('conferido');
    expect(documentSituation({ ...both, verso: { ...both.verso!, leitura: { ...both.verso!.leitura!, legivel: false } } })).toBe('em_analise');
    expect(documentSituation({ ...both, revisao: { aprovado: false, motivo: 'foto cortada', em: '', por: 'a', nome: 'A' } })).toBe('recusado');
  });
});

describe('certificado digital da contratante (e-CNPJ A1)', () => {
  it('sem certificado o PDF sai como antes; com certificado sai assinado; senha errada não trava', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const forge = require('node-forge');
    const keys = forge.pki.rsa.generateKeyPair(1024);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date(Date.now() - 1000);
    cert.validity.notAfter = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    const attrs = [{ name: 'commonName', value: 'SORTE TECH TESTE:65265592000119' }];
    cert.setSubject(attrs); cert.setIssuer(attrs);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    const p12 = forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], 'senha-teste', { algorithm: '3des' })).getBytes();
    const env = { CONTRATO_CERTIFICADO_A1_BASE64: Buffer.from(p12, 'binary').toString('base64'), CONTRATO_CERTIFICADO_SENHA: 'senha-teste' } as NodeJS.ProcessEnv;
    const pdf = await buildContractPdf({ numero: 'BLC-1', titulo: 'Contrato', texto: 'Texto', hash: 'a'.repeat(64), status: 'assinado', blocks: [], verifyUrl: 'https://x', footer: 'x' });
    expect(await signPdfWithCompanyCertificate(pdf, { reason: 'r', location: 'l', name: 'n' }, {} as NodeJS.ProcessEnv)).toEqual({ buffer: pdf, assinado: false });
    const signed = await signPdfWithCompanyCertificate(pdf, { reason: 'Contratante', location: 'Brasília/DF', name: 'SORTE TECH' }, env);
    expect(signed.assinado).toBe(true);
    expect(signed.buffer.toString('latin1')).toContain('/ByteRange');
    expect(await icpInfo(env)).toMatchObject({ configurado: true, titular: 'SORTE TECH TESTE:65265592000119', vencido: false });
    const wrong = await signPdfWithCompanyCertificate(pdf, { reason: 'r', location: 'l', name: 'n' }, { ...env, CONTRATO_CERTIFICADO_SENHA: 'x' } as NodeJS.ProcessEnv);
    expect(wrong.assinado).toBe(false);
    expect(await icpInfo({ ...env, CONTRATO_CERTIFICADO_SENHA: 'x' } as NodeJS.ProcessEnv)).toMatchObject({ configurado: true, erro: 'Senha do certificado incorreta.' });
  }, 30000);
});

describe('tabela de comissões do aditivo e papel timbrado', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const t = require('./contract-templates');
  const party = { nome: 'Maria da Silva', cpf: '52998224725', email: 'm@x.com', telefone: '61999998888', dataNascimento: new Date('1990-05-10'), endereco: 'Rua A', codigoAfiliado: 'BLX', comissaoPct: '20.00' };
  const text = (company: unknown) => t.buildContractText({ kind: 'aditivo-bonificacao', numero: 'BLA-1', company, affiliate: party, date: new Date('2026-11-21T12:00:00Z'), mainContract: { numero: 'BLC-1', data: new Date('2026-11-21T12:00:00Z') } });

  it('com a tabela padrão, o texto e a assinatura do modelo não mudam', () => {
    const base = t.sanitizeCompany({});
    const withDefault = t.sanitizeCompany({ bonificacao: t.DEFAULT_BONUS });
    expect(withDefault.bonificacao).toBeUndefined();
    expect(t.companyHash(withDefault)).toBe(t.companyHash(base));
    expect(text(base)).toContain('BRONZE — de 1 até 20 bolões — 20%\nPRATA — de 21 até 40 bolões — 25%\nOURO — de 41 até 80 bolões — 30%\nDIAMANTE — de 81 bolões em diante — 35%');
    expect(text(base)).toContain('Ao atingir a quantidade de 20 (vinte) bolões');
  });

  it('tabela nova entra no texto, muda a assinatura do modelo e recusa limites fora de ordem', () => {
    const table = { faixas: [{ ate: 10, pct: 15 }, { ate: 30, pct: 22.5 }, { ate: 60, pct: 30 }, { ate: null, pct: 40 }], extraPct: 45 };
    const company = t.sanitizeCompany({ bonificacao: table });
    const out = text(company);
    expect(out).toContain('BRONZE — de 1 até 10 bolões — 15%\nPRATA — de 11 até 30 bolões — 22,5%\nOURO — de 31 até 60 bolões — 30%\nDIAMANTE — de 61 bolões em diante — 40%');
    expect(out).toContain('bonificação extraordinária de até 45%');
    expect(out).toContain('categoria BRONZE, fazendo jus à bonificação de 15%');
    expect(out).toContain('Ao atingir a quantidade de 10 (dez) bolões fechados e devidamente validados, o AFILIADO será automaticamente promovido à categoria PRATA, passando a receber bonificação de 22,5%');
    expect(t.companyHash(company)).not.toBe(t.companyHash(t.sanitizeCompany({})));
    expect(t.sanitizeBonus({ faixas: [{ ate: 40, pct: 15 }, { ate: 30, pct: 22 }, { ate: 60, pct: 30 }, { ate: null, pct: 40 }], extraPct: 45 })).toEqual(t.DEFAULT_BONUS);
  });

  it('o painel recusa tabela inválida e mantém a tabela atual quando salva só os dados da empresa', async () => {
    const store: Record<string, string> = {};
    const prisma: any = { configuracaoSistema: { findUnique: jest.fn(async ({ where }: any) => (store[where.chave] ? { chave: where.chave, valor: store[where.chave] } : null)), upsert: jest.fn(async ({ where, create, update }: any) => { store[where.chave] = (update ?? create).valor; return {}; }) } };
    const service = new ContractsService(prisma, { record: jest.fn() } as any, { publicUrl: () => 'https://bolaolivre.com', send: jest.fn(async () => true) } as any, { forAffiliate: jest.fn(async () => null) } as any);
    const admin = { id: 'adm', email: 'a@x.com', papel: 'admin' } as any;
    await expect(service.saveCompany(admin, { bonificacao: { faixas: [{ ate: 50, pct: 10 }, { ate: 20, pct: 20 }, { ate: 80, pct: 30 }, { ate: null, pct: 35 }], extraPct: 40 } } as any)).rejects.toThrow('Confira a tabela');
    const table = { faixas: [{ ate: 10, pct: 15 }, { ate: 30, pct: 22 }, { ate: 60, pct: 30 }, { ate: null, pct: 40 }], extraPct: 45 };
    await service.saveCompany(admin, { bonificacao: table } as any);
    const saved = await service.saveCompany(admin, { razaoSocial: 'SORTE TECH SERVIÇOS DIGITAIS LTDA' } as any);
    expect(saved.dados.bonificacao?.faixas[0]).toMatchObject({ ate: 10, pct: 15 });
    const preview = await service.modelPreview('aditivo-bonificacao');
    expect(preview.filename).toBe('modelo-aditivo-bonificacao.pdf');
    expect(preview.buffer.subarray(0, 5).toString()).toBe('%PDF-');
    await expect(service.modelPreview('outro' as any)).rejects.toThrow('Modelo inválido');
  }, 20000);
});
