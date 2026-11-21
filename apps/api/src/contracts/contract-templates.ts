import { createHash } from 'node:crypto';

/**
 * Modelos dos contratos do afiliado. O texto é montado com os dados da empresa (contratante e representante legal)
 * e do afiliado e fica congelado no momento da geração: o hash SHA-256 identifica exatamente o que foi assinado.
 */
export const CONTRACT_TEMPLATE_VERSION = '2026-11-19.1';

export type ContractKind = 'afiliado' | 'aditivo-bonificacao';
export const CONTRACT_KINDS: readonly ContractKind[] = ['afiliado', 'aditivo-bonificacao'];
export const CONTRACT_TITLES: Record<ContractKind, string> = {
  afiliado: 'Contrato de Parceria Comercial e Afiliação',
  'aditivo-bonificacao': 'Primeiro Termo Aditivo — Programa de Bonificação',
};

export type CompanyData = {
  razaoSocial: string;
  cnpj: string;
  nire: string;
  registroJunta: string;
  endereco: string;
  marca: string;
  representanteNome: string;
  representanteCargo: string;
  representanteNacionalidade: string;
  representanteEstadoCivil: string;
  representanteProfissao: string;
  representanteCpf: string;
  representanteRg: string;
  cidade: string;
  foro: string;
  prazoAvisoDias: number;
};

/** Dados conferidos no Contrato Social (JUCIS-DF nº 53203684617, 13/02/2026) e no documento do administrador. */
export const DEFAULT_COMPANY: CompanyData = {
  razaoSocial: 'SORTE TECH SERVIÇOS DIGITAIS LTDA',
  cnpj: '65.265.592/0001-19',
  nire: '53203684617',
  registroJunta: 'registrado na Junta Comercial, Industrial e Serviços do Distrito Federal sob o nº 53203684617, em 13/02/2026',
  endereco: 'Setor Guará II/Polo de Modas, QE 40, Rua 20, Lote 23, Guará, Brasília/DF, CEP 71.070-520',
  marca: 'BL — Bolão Livre',
  representanteNome: 'CARLOS DEL VECCHIO BERALDO VIEIRA',
  representanteCargo: 'Administrador',
  representanteNacionalidade: 'brasileiro',
  representanteEstadoCivil: 'divorciado',
  representanteProfissao: 'empresário',
  representanteCpf: '167.127.301-04',
  representanteRg: '942709 SSP/DF',
  cidade: 'Brasília/DF',
  foro: 'Brasília/DF',
  prazoAvisoDias: 30,
};

export type AffiliateParty = {
  nome: string;
  cpf: string;
  email: string;
  telefone: string | null;
  dataNascimento: Date | null;
  endereco: string | null;
  codigoAfiliado: string;
  comissaoPct: string | null;
  /** Dados preenchidos pelo afiliado antes de assinar (opcionais nos contratos antigos). */
  rg?: string | null;
  rgOrgao?: string | null;
  nacionalidade?: string | null;
  estadoCivil?: string | null;
  profissao?: string | null;
};

export type ContractInput = { kind: ContractKind; numero: string; company: CompanyData; affiliate: AffiliateParty; date: Date; mainContract?: { numero: string; data: Date } | null };

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const NUMBERS = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove', 'vinte'];
const TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];

/** Número por extenso (0 a 999), usado nos prazos em dias. */
export function numberInWords(value: number): string {
  const n = Math.max(0, Math.min(999, Math.trunc(value)));
  if (n <= 20) return NUMBERS[n]!;
  if (n < 100) { const unit = n % 10; return unit ? `${TENS[Math.trunc(n / 10)]} e ${NUMBERS[unit]}` : TENS[Math.trunc(n / 10)]!; }
  if (n === 100) return 'cem';
  const hundreds = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'][Math.trunc(n / 100)]!;
  const rest = n % 100;
  return rest ? `${hundreds} e ${numberInWords(rest)}` : hundreds;
}

/** Data por extenso no horário de Brasília: "19 de novembro de 2026". */
export function longDate(date: Date): string {
  const local = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return `${local.getUTCDate()} de ${MONTHS[local.getUTCMonth()]} de ${local.getUTCFullYear()}`;
}

/** Data curta no horário de Brasília: 19/11/2026. */
export function shortDate(date: Date): string {
  const local = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return `${String(local.getUTCDate()).padStart(2, '0')}/${String(local.getUTCMonth() + 1).padStart(2, '0')}/${local.getUTCFullYear()}`;
}

export function formatCpf(cpf: string): string {
  const d = cpf.replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : cpf;
}

export function formatPhone(phone: string | null): string | null {
  const d = (phone ?? '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d || null;
}

/** Hash dos dados da empresa + versão do modelo: a aprovação do representante vale para os contratos com este mesmo hash. */
export function companyHash(company: CompanyData): string {
  const ordered = Object.fromEntries(Object.keys(DEFAULT_COMPANY).map((key) => [key, company[key as keyof CompanyData]]));
  return createHash('sha256').update(`${CONTRACT_TEMPLATE_VERSION}|${JSON.stringify(ordered)}`, 'utf8').digest('hex');
}

export function textHash(texto: string): string {
  return createHash('sha256').update(texto, 'utf8').digest('hex');
}

function companyQualification(c: CompanyData, alias: string): string {
  return `${c.razaoSocial}, sociedade empresária limitada, inscrita no CNPJ sob o nº ${c.cnpj}, NIRE ${c.nire}, com sede em ${c.endereco}, titular da plataforma ${c.marca}, doravante denominada simplesmente ${alias}, neste ato representada por seu ${c.representanteCargo.toLowerCase()}, ${c.representanteNome}, ${c.representanteNacionalidade}, ${c.representanteEstadoCivil}, ${c.representanteProfissao}, inscrito no CPF sob o nº ${c.representanteCpf}, portador da cédula de identidade nº ${c.representanteRg}, com poderes de representação conferidos pela Cláusula Sexta do Contrato Social ${c.registroJunta}.`;
}

function affiliateQualification(a: AffiliateParty): string {
  // Data de nascimento é só data (gravada à meia-noite UTC): lida em UTC para não voltar um dia.
  const birthDate = a.dataNascimento ? new Date(a.dataNascimento) : null;
  const birth = birthDate && !Number.isNaN(birthDate.getTime()) ? `, nascido(a) em ${String(birthDate.getUTCDate()).padStart(2, '0')}/${String(birthDate.getUTCMonth() + 1).padStart(2, '0')}/${birthDate.getUTCFullYear()}` : '';
  const address = a.endereco ? `residente e domiciliado(a) em ${a.endereco}` : 'com endereço informado em seu cadastro na plataforma';
  const phone = formatPhone(a.telefone);
  const personal = [a.nacionalidade, a.estadoCivil, a.profissao].map((item) => item?.trim()).filter(Boolean).map((item) => `, ${item!.toLowerCase()}`).join('');
  const rg = a.rg?.trim() ? `, portador(a) da cédula de identidade nº ${a.rg.trim()}${a.rgOrgao?.trim() ? ` ${a.rgOrgao.trim().toUpperCase()}` : ''}` : '';
  return `${a.nome.toUpperCase()}${personal}${rg}, inscrito(a) no CPF sob o nº ${formatCpf(a.cpf)}${birth}, maior e capaz, ${address}, com endereço eletrônico ${a.email}${phone ? ` e telefone ${phone}` : ''}, identificado(a) na plataforma pelo código de afiliado ${a.codigoAfiliado}, doravante denominado(a) simplesmente AFILIADO`;
}

function signatureBlock(c: CompanyData, a: AffiliateParty, alias: string): string {
  return [
    `CONTRATANTE: ${c.razaoSocial} (${alias}) — CNPJ ${c.cnpj}`,
    `Representante legal: ${c.representanteNome} — ${c.representanteCargo} — CPF ${c.representanteCpf}`,
    'Assinatura eletrônica registrada no certificado de assinatura deste contrato.',
    '',
    `AFILIADO: ${a.nome.toUpperCase()} — CPF ${formatCpf(a.cpf)}`,
    'Assinatura eletrônica por código de confirmação enviado ao e-mail cadastrado, registrada no certificado de assinatura deste contrato.',
  ].join('\n');
}

function electronicClause(n: string, alias: string, heading = `${n}. DA CONTRATAÇÃO ELETRÔNICA E DA VALIDADE JURÍDICA`): string {
  return `${heading}

${n}.1. As Partes reconhecem e aceitam a celebração deste instrumento por meio eletrônico, admitindo como válida e eficaz a assinatura eletrônica realizada na plataforma, nos termos do art. 10, § 2º, da Medida Provisória nº 2.200-2/2001, do art. 107 do Código Civil e da Lei nº 14.063/2020.

${n}.2. A assinatura do AFILIADO se dá pela digitação, na plataforma, do código numérico único e temporário enviado ao endereço eletrônico cadastrado em seu nome, com o registro de data e hora, endereço IP, dispositivo e navegador utilizados, localização informada pelo aparelho (quando autorizada) e código de verificação (hash SHA-256) do texto assinado, que integram o certificado de assinatura deste contrato.

${n}.3. A ${alias} assina por meio de seu representante legal, que aprovou eletronicamente o presente modelo de contrato, com os mesmos registros de autenticação.

${n}.4. As Partes reconhecem a integridade e a autoria deste documento, que pode ter sua autenticidade conferida na plataforma pelo número do contrato e pelo código de verificação, e declaram que a forma eletrônica não poderá ser invocada para negar seus efeitos, admitida qualquer modalidade de assinatura eletrônica prevista em lei, nos termos do art. 784, § 4º, do Código de Processo Civil.

${n}.5. Os dados de registro da assinatura são tratados exclusivamente para comprovar a celebração e a execução deste contrato e para o exercício regular de direitos, nos termos do art. 7º, incisos V e VI, da Lei nº 13.709/2018 (LGPD).

${n}.6. Uma via deste contrato, com o certificado de assinatura, fica disponível para download pelo AFILIADO em seu painel na plataforma.`;
}

export function affiliateContractText(input: ContractInput): string {
  const { company: c, affiliate: a, numero, date } = input;
  const days = Math.max(1, Math.trunc(c.prazoAvisoDias || 30));
  const commission = a.comissaoPct && Number(a.comissaoPct) > 0 ? Number(a.comissaoPct).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : null;
  return `CONTRATO DE PARCERIA COMERCIAL E AFILIAÇÃO
Contrato nº ${numero}

CONTRATANTE: ${companyQualification(c, 'BL')}

CONTRATADO: ${affiliateQualification(a)}.

As Partes acima identificadas têm, entre si, justo e acertado o presente Contrato de Parceria Comercial e Afiliação, que se regerá pelas cláusulas e condições a seguir expostas.

1. DO OBJETO

1.1. O presente contrato tem por objeto a intermediação de vendas e promoção, pelo AFILIADO, dos produtos e/ou serviços disponibilizados pela BL, mediante o uso de links de rastreamento específicos, em caráter estritamente de parceria comercial.

2. DA INEXISTÊNCIA DE VÍNCULO TRABALHISTA

2.1. Inexistência de Vínculo: O presente contrato é de natureza estritamente civil e comercial. Não se estabelece entre as Partes, sob nenhuma hipótese, qualquer vínculo empregatício, relação de subordinação, dependência econômica, pessoalidade ou exclusividade, nos termos da Consolidação das Leis do Trabalho (CLT).

2.2. Autonomia Total: O AFILIADO atuará com total autonomia profissional, liberdade de horários e diretrizes próprias. A BL não exercerá qualquer poder diretivo, disciplinar ou de fiscalização sobre a rotina de trabalho do AFILIADO.

2.3. Pluralidade de Parcerias: Fica expressamente autorizado ao AFILIADO prestar serviços, promover produtos ou firmar contratos com quaisquer terceiros, inclusive concorrentes diretos da BL.

2.4. Custos Operacionais: Todos os custos, despesas, ferramentas, internet, publicidade, contratação de terceiros ou insumos necessários para a atividade do AFILIADO correrão por sua conta exclusiva, sem direito a qualquer reembolso por parte da BL ou presunção de subordinação econômica.

3. DA RESPONSABILIDADE TRIBUTÁRIA E FISCAL

3.1. Obrigações Fiscais: Cada Parte é única e exclusivamente responsável pelo recolhimento e pagamento de todos os tributos (impostos, taxas, contribuições sociais e previdenciárias) incidentes sobre as suas respectivas atividades e receitas.

3.2. Retenções: A BL efetuará as retenções tributárias na fonte apenas quando a legislação federal, estadual ou municipal expressamente exigir, efetuando o repasse do valor líquido das comissões ao AFILIADO.

3.3. Regularidade do Afiliado: O AFILIADO declara estar regularmente inscrito nos órgãos competentes e fiscais para o exercício da atividade de promoção de vendas, assumindo total e exclusiva responsabilidade por eventuais autuações decorrentes da sua irregularidade fiscal.

4. DA INDENIZAÇÃO E REGRESSO

4.1. Práticas de Divulgação: O AFILIADO compromete-se a realizar a divulgação dos produtos/serviços de forma ética, sendo expressamente proibido o uso de SPAM, publicidade enganosa, promessas de ganhos fáceis, uso indevido da marca BL ou violação de direitos de propriedade intelectual de terceiros.

4.2. Responsabilização Exclusiva: O AFILIADO responderá civil e criminalmente por qualquer dano material, moral ou à imagem causado à BL, aos clientes desta ou a terceiros em razão de sua conduta fraudulenta, negligente ou em desconformidade com este contrato.

4.3. Cláusula de Regresso e Indenização: Caso a BL seja demandada judicial ou administrativamente (seja na esfera trabalhista, cível, fiscal ou consumerista) por atos praticados pelo AFILIADO, este obriga-se a:
a) requerer a exclusão da BL do polo passivo da demanda;
b) assumir imediatamente a responsabilidade pelo litígio;
c) reembolsar integralmente a BL por todas as despesas incorridas, incluindo custas processuais, honorários advocatícios contratuais e sucumbenciais, bem como eventuais condenações ou acordos firmados.

5. DA REMUNERAÇÃO

5.1. O AFILIADO receberá uma comissão por venda efetivamente convertida e paga, cujos percentuais e regras de atribuição estão descritos na plataforma ou em anexo deste contrato.

5.2. Condição para Pagamento: As comissões só serão devidas e liberadas após o decurso do prazo de arrependimento legal do consumidor (art. 49 do Código de Defesa do Consumidor) ou contratual estipulado pela BL, e desde que a venda não tenha sido cancelada, estornada ou contestada.

5.3. ${commission ? `Na data deste contrato, o percentual de comissão atribuído ao AFILIADO na plataforma é de ${commission}% (por cento) sobre a taxa de administração das vendas elegíveis, podendo ser alterado conforme as regras e os níveis vigentes, mediante comunicação prévia ao AFILIADO.` : 'O percentual de comissão atribuído ao AFILIADO é o informado em seu painel na plataforma, podendo ser alterado conforme as regras e os níveis vigentes, mediante comunicação prévia ao AFILIADO.'}

5.4. A base de cálculo, o percentual, o valor e a situação de cada comissão ficam disponíveis ao AFILIADO, a qualquer tempo, em seu painel na plataforma.

6. DA PROPRIEDADE INTELECTUAL E LGPD

6.1. O AFILIADO está autorizado a utilizar as marcas, logotipos e materiais de marketing da BL exclusivamente para o objeto deste contrato, sendo vedada qualquer modificação ou registro em seu próprio nome.

6.2. Ambas as Partes se comprometem a cumprir rigorosamente as normas da Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018), sendo o AFILIADO o único responsável pelo tratamento de dados que realizar em suas próprias páginas de captura ou campanhas.

7. DA RESCISÃO

7.1. O presente contrato poderá ser rescindido por qualquer das Partes, a qualquer momento, mediante aviso prévio por escrito (inclusive por e-mail ou notificação na plataforma) com antecedência mínima de ${days} (${numberInWords(days)}) dias, sem que caiba qualquer direito a indenização, retenção ou aviso prévio indenizado.

7.2. A infração de qualquer cláusula deste contrato, em especial as de práticas éticas de mercado, ensejará a rescisão imediata por justa causa, com o bloqueio imediato do saldo de comissões do AFILIADO a título de compensação por perdas e danos.

8. DO FORO

8.1. Para dirimir quaisquer controvérsias oriundas do presente contrato, as Partes elegem expressamente o Foro da Comarca de ${c.foro}, com renúncia expressa a qualquer outro, por mais privilegiado que seja.

${electronicClause('9', 'BL')}

10. DAS COMUNICAÇÕES

10.1. As comunicações entre as Partes serão feitas por escrito, por meio do endereço eletrônico cadastrado pelo AFILIADO na plataforma ou por notificação na própria plataforma, cabendo ao AFILIADO manter seus dados de contato atualizados.

Por estarem assim acordadas, as Partes assinam eletronicamente o presente instrumento, na forma da Cláusula Nona.

${c.cidade}, ${longDate(date)}.

${signatureBlock(c, a, 'BL')}`;
}

export function bonusAddendumText(input: ContractInput): string {
  const { company: c, affiliate: a, numero, date, mainContract } = input;
  const main = mainContract ? `Contrato de Parceria Comercial e Afiliação nº ${mainContract.numero}, de ${shortDate(mainContract.data)}` : 'Contrato de Parceria Comercial e Afiliação';
  const brand = 'BL – BOLÃO LIVRE';
  return `PRIMEIRO TERMO ADITIVO AO CONTRATO DE AFILIADO
PROGRAMA DE BONIFICAÇÃO E DESEMPENHO COMERCIAL ${brand}
Termo Aditivo nº ${numero}

CONTRATANTE: ${companyQualification(c, 'CONTRATANTE')}

AFILIADO: ${affiliateQualification(a)}.

As Partes acima qualificadas, considerando a existência do ${main}, celebrado entre elas, resolvem firmar o presente PRIMEIRO TERMO ADITIVO AO CONTRATO DE AFILIADO, mediante as cláusulas e condições seguintes.

CLÁUSULA PRIMEIRA – DA FINALIDADE DO TERMO ADITIVO

1.1. O presente Termo Aditivo tem por finalidade instituir e regulamentar o Plano de Execução, Desempenho e Bonificação do Programa de Afiliados denominado ${brand}, produto comercial integrado à plataforma tecnológica ${brand}, administrada e desenvolvida no âmbito das atividades da ${c.razaoSocial}.

1.2. O presente instrumento estabelece critérios específicos para remuneração variável dos afiliados, mediante bonificações vinculadas à prospecção comercial, captação de interessados e efetivo fechamento de bolões, observadas as regras operacionais e comerciais da plataforma.

1.3. O presente Termo Aditivo complementa o Contrato de Afiliado original, permanecendo todas as demais cláusulas, condições, obrigações e responsabilidades anteriormente pactuadas em pleno vigor, exceto naquilo que for expressamente alterado por este instrumento.

CLÁUSULA SEGUNDA – DA VINCULAÇÃO AO PROGRAMA ${brand}

2.1. O AFILIADO passa a integrar, mediante este instrumento, o programa de desempenho comercial denominado ${brand}, destinado à expansão da rede de usuários, participantes e clientes da plataforma ${brand}.

2.2. O programa tem como objetivo incentivar a produtividade comercial, reconhecer resultados individuais e estabelecer uma política progressiva de bonificação, conforme o volume de bolões efetivamente fechados e validados.

2.3. A participação do AFILIADO no programa não representa aquisição de participação societária, propriedade intelectual, titularidade ou qualquer direito sobre a plataforma ${brand}, restringindo-se aos direitos e obrigações previstos no contrato principal e neste aditivo.

CLÁUSULA TERCEIRA – DA CLASSIFICAÇÃO E DOS NÍVEIS DE BONIFICAÇÃO

3.1. O programa de bonificação será estruturado em quatro níveis de desempenho, classificados como:
I – BRONZE;
II – PRATA;
III – OURO;
IV – DIAMANTE.

3.2. Cada nível corresponderá a um percentual de bonificação sobre a base de remuneração comercial estabelecida pela CONTRATANTE para cada bolão fechado e validado.

3.3. Fica estabelecida a seguinte tabela de bonificação:
BRONZE — de 1 até 20 bolões — 20%
PRATA — de 21 até 40 bolões — 25%
OURO — de 41 até 80 bolões — 30%
DIAMANTE — de 81 bolões em diante — 35%

3.4. A CONTRATANTE poderá instituir campanhas especiais de desempenho para os afiliados classificados no nível DIAMANTE, podendo estabelecer bonificação extraordinária de até 40%, mediante comunicação e regulamentação específica.

3.5. Os percentuais estabelecidos neste instrumento representam os valores de bonificação devidos ao AFILIADO, não incidindo automaticamente sobre o valor integral das apostas ou cotas dos participantes, mas sobre a base de remuneração comercial previamente definida e informada pela CONTRATANTE.

CLÁUSULA QUARTA – DA PROGRESSÃO AUTOMÁTICA DE CATEGORIA

4.1. O AFILIADO iniciará sua participação no programa na categoria BRONZE, fazendo jus à bonificação de 20%.

4.2. Ao atingir a quantidade de 20 (vinte) bolões fechados e devidamente validados, o AFILIADO será automaticamente promovido à categoria PRATA, passando a receber bonificação de 25%.

4.3. A progressão para os níveis OURO e DIAMANTE ocorrerá conforme o atingimento das respectivas metas estabelecidas na Cláusula Terceira.

4.4. Para fins de classificação, será considerado o total acumulado de bolões fechados e validados durante a vigência do contrato de afiliado, não sendo exigida a realização de uma nova meta a cada mês.

4.5. A progressão de nível produzirá efeitos a partir do fechamento do bolão que completar a respectiva meta, aplicando-se o novo percentual aos bolões fechados posteriormente.

4.6. As bonificações dos bolões anteriores à progressão permanecerão calculadas conforme o percentual vigente na data de seu respectivo fechamento, não havendo recálculo retroativo.

4.7. A categoria alcançada será mantida durante a vigência do contrato, ressalvadas as hipóteses de fraude comprovada, rescisão contratual ou demais situações expressamente previstas no contrato principal.

CLÁUSULA QUINTA – DA BASE DE CÁLCULO DA BONIFICAÇÃO

5.1. A bonificação será calculada sobre a receita ou remuneração comercial efetivamente atribuída à CONTRATANTE em cada bolão fechado, conforme tabela financeira e comercial vigente.

5.2. A CONTRATANTE deverá informar ao AFILIADO os critérios de apuração da base de cálculo, garantindo transparência quanto aos valores utilizados para determinação da bonificação.

5.3. Para cada operação, deverão ser identificados:
I – o bolão comercializado e fechado;
II – o AFILIADO responsável pela prospecção;
III – a base de cálculo da bonificação;
IV – o percentual correspondente ao nível do AFILIADO;
V – o valor final da bonificação.

5.4. Qualquer alteração da base de cálculo deverá ser previamente comunicada ao AFILIADO, não podendo prejudicar valores já adquiridos.

CLÁUSULA SEXTA – DA RESPONSABILIDADE DA CONTRATANTE PELO PAGAMENTO

6.1. A ${c.razaoSocial} assume integral responsabilidade pela apuração, processamento e pagamento das bonificações devidas aos afiliados participantes do programa ${brand}.

6.2. Fica estabelecido que o pagamento da bonificação será realizado em até 3 (três) dias úteis após a entrega e a validação do bolão fechado pelo AFILIADO, desde que cumpridas as exigências documentais e operacionais previstas neste instrumento.

6.3. A obrigação de pagamento será de responsabilidade da CONTRATANTE, não podendo ser transferida ao cliente, participante do bolão ou a qualquer terceiro envolvido na operação.

6.4. A CONTRATANTE deverá manter controles administrativos e financeiros que permitam identificar as operações realizadas e os respectivos valores de bonificação.

CLÁUSULA SÉTIMA – DOS REQUISITOS PARA LIBERAÇÃO DO PAGAMENTO

7.1. Para que o pagamento da bonificação seja liberado, deverão ser observadas as seguintes exigências:
I – o AFILIADO deverá possuir Contrato de Afiliado vigente e devidamente assinado junto à ${c.razaoSocial};
II – o bolão deverá estar devidamente registrado, identificado e validado pela CONTRATANTE;
III – deverá existir comprovação da participação comercial do AFILIADO na operação;
IV – o AFILIADO deverá assinar imediatamente o Recibo de Pagamento de Autônomo (RPA), por meio eletrônico ou físico, emitido pela CONTRATANTE;
V – a falta da assinatura do RPA pelo AFILIADO suspende qualquer pagamento futuro, até a sua regularização;
VI – deverão ser apresentados os dados cadastrais, bancários e fiscais necessários ao processamento do pagamento em nome do AFILIADO, sendo vedada a transferência do pagamento para terceiros.

7.2. O RPA deverá conter a identificação das partes, o valor da bonificação, a data da operação e a respectiva identificação do bolão.

7.3. Quando o AFILIADO estiver constituído como pessoa jurídica, deverá apresentar a documentação fiscal correspondente, especialmente a nota fiscal de prestação de serviços, conforme a legislação aplicável.

7.4. Após a apresentação e a conferência da documentação exigida, a CONTRATANTE efetuará o pagamento no prazo estabelecido na Cláusula Sexta.

7.5. O comprovante de pagamento, acompanhado do respectivo recibo ou documento fiscal, servirá como comprovação da quitação da bonificação específica.

CLÁUSULA OITAVA – DO REGISTRO E CONTROLE DE DESEMPENHO

8.1. A CONTRATANTE manterá controle administrativo ou eletrônico das operações realizadas pelos afiliados, com a finalidade de registrar os bolões fechados, os resultados individuais e os respectivos níveis de bonificação.

8.2. Os registros poderão ser realizados por meio da plataforma ${brand}, sistemas internos, ferramentas de acompanhamento ou outros meios oficialmente disponibilizados.

8.3. O AFILIADO poderá solicitar demonstrativo de sua produção, quantidade de bolões fechados, classificação atual e bonificações apuradas.

8.4. Havendo divergência na contabilização dos resultados, as Partes deverão proceder à conferência dos registros antes da aplicação de qualquer penalidade ou alteração de valores.

CLÁUSULA NONA – DAS OBRIGAÇÕES DO AFILIADO NO PROGRAMA

9.1. O AFILIADO compromete-se a:
I – atuar na prospecção e captação de interessados nos produtos e serviços autorizados;
II – promover a divulgação da plataforma ${brand} de maneira ética e responsável;
III – registrar corretamente os clientes e operações comerciais;
IV – respeitar as orientações e procedimentos operacionais da CONTRATANTE;
V – não utilizar informações falsas ou promessas de resultados garantidos em jogos e loterias;
VI – não receber ou movimentar recursos financeiros dos participantes em contas particulares, salvo autorização formal e procedimento juridicamente validado;
VII – zelar pela reputação comercial e institucional da ${c.razaoSocial} e da plataforma ${brand}.

CLÁUSULA DÉCIMA – DA PROTEÇÃO DA MARCA, CONFIDENCIALIDADE E LGPD

10.1. Permanecem integralmente aplicáveis ao presente aditivo todas as disposições do contrato principal relativas à propriedade intelectual, utilização das marcas ${brand}, confidencialidade e proteção de dados pessoais.

10.2. O AFILIADO compromete-se a observar integralmente a Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais – LGPD), utilizando os dados de clientes e participantes exclusivamente para as finalidades autorizadas.

10.3. A utilização indevida da plataforma, desvio de clientes, compartilhamento não autorizado de informações ou violação de dados pessoais poderá caracterizar infração contratual grave, sujeitando o responsável às penalidades previstas no contrato principal e na legislação vigente.

CLÁUSULA DÉCIMA PRIMEIRA – DA RESCISÃO E DOS DIREITOS ADQUIRIDOS

11.1. A rescisão do contrato principal implicará o encerramento da participação do AFILIADO no programa ${brand}.

11.2. O encerramento da relação contratual não prejudicará o direito ao recebimento das bonificações referentes aos bolões efetivamente fechados, validados e atribuídos ao AFILIADO até a data da rescisão.

11.3. A CONTRATANTE deverá realizar a apuração final das bonificações pendentes e providenciar os pagamentos devidos, mediante apresentação da documentação fiscal aplicável.

11.4. Eventuais alterações futuras nas regras do programa dependerão de comunicação formal e, quando implicarem modificação das condições econômicas deste aditivo, de concordância expressa do AFILIADO.

CLÁUSULA DÉCIMA SEGUNDA – DA INTEGRAÇÃO E PREVALÊNCIA CONTRATUAL

12.1. O presente instrumento constitui parte integrante e complementar do Contrato de Afiliado originalmente celebrado entre as Partes.

12.2. Todas as cláusulas e condições do contrato principal que não tenham sido expressamente modificadas por este aditivo permanecem válidas e eficazes.

12.3. Em caso de divergência entre as disposições do contrato principal e deste aditivo, prevalecerão as disposições deste instrumento exclusivamente quanto às matérias relacionadas ao plano de execução, metas, classificação e bonificação do programa ${brand}.

12.4. O presente aditivo não substitui nem extingue o contrato principal, nem implica novação, destinando-se exclusivamente a complementar e regulamentar a política de remuneração variável dos afiliados.

CLÁUSULA DÉCIMA TERCEIRA – DA VIGÊNCIA

13.1. O presente Termo Aditivo entrará em vigor na data de sua assinatura, permanecendo vigente enquanto estiver em vigor o Contrato de Afiliado principal ou até que seja substituído por outro instrumento formalmente celebrado entre as Partes.

13.2. As Partes reconhecem que as condições de bonificação aqui estabelecidas passam a integrar a relação contratual a partir da assinatura deste instrumento.

CLÁUSULA DÉCIMA QUARTA – DO FORO

14.1. Fica mantido o foro estabelecido no contrato principal para dirimir quaisquer controvérsias decorrentes deste aditivo, ressalvadas as regras legais de competência aplicáveis.

${electronicClause('15', 'CONTRATANTE', 'CLÁUSULA DÉCIMA QUINTA – DA CONTRATAÇÃO ELETRÔNICA E DA VALIDADE JURÍDICA')}

E, por estarem de pleno acordo, as Partes firmam eletronicamente o presente Primeiro Termo Aditivo, na forma da Cláusula Décima Quinta.

${c.cidade}, ${longDate(date)}.

${signatureBlock(c, a, 'CONTRATANTE')}`;
}

export function buildContractText(input: ContractInput): string {
  return input.kind === 'aditivo-bonificacao' ? bonusAddendumText(input) : affiliateContractText(input);
}

/** Normaliza e valida os dados da empresa vindos do painel (campos vazios voltam ao padrão). */
export function sanitizeCompany(raw: Partial<CompanyData> | null | undefined): CompanyData {
  const out = { ...DEFAULT_COMPANY };
  if (!raw || typeof raw !== 'object') return out;
  for (const key of Object.keys(DEFAULT_COMPANY) as Array<keyof CompanyData>) {
    const value = raw[key];
    if (key === 'prazoAvisoDias') {
      const days = Number(value);
      if (Number.isFinite(days) && days >= 1 && days <= 365) out.prazoAvisoDias = Math.trunc(days);
    } else if (typeof value === 'string' && value.trim()) {
      (out as Record<string, unknown>)[key] = value.trim().slice(0, 400);
    }
  }
  return out;
}
