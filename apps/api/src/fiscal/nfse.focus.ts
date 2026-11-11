import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';

/**
 * Emissor de NFS-e pela Focus NFe (endpoint v2/nfsen, layout nacional; Brasília/DF usa o ISSNet com esse layout).
 * A nota é independente da cobrança: o valor enviado é só o do serviço (taxa de administração).
 */
export type FocusHttp = (method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown) => Promise<{ status: number; body: string }>;

export type FocusStatus = 'aguardando' | 'emitida' | 'erro' | 'cancelada';

export interface FocusTomador {
  cpf: string;
  nome: string;
  email?: string | null;
  telefone?: string | null;
  endereco?: { cep: string; logradouro: string; numero: string; complemento?: string | null; bairro: string; codigoMunicipio: string } | null;
}

export interface FocusIssuer {
  cnpj: string;
  inscricaoMunicipal: string;
  codigoMunicipio: string;
  codigoTributacaoNacional: string;
  codigoTributacaoMunicipal?: string;
  /** 1 = não optante, 2 = MEI, 3 = ME/EPP (optante pelo Simples Nacional). */
  opcaoSimples: number;
  /** Percentual aproximado de tributos (Simples Nacional); só informativo. */
  percentualTributos: number;
  /** Campos opcionais da reforma tributária; só vão se preenchidos. */
  nbs?: string;
  indicadorOperacao?: string;
  ibsCbsSituacao?: string;
  ibsCbsClassificacao?: string;
}

export interface FocusEmitInput {
  issuer: FocusIssuer;
  tomador: FocusTomador;
  /** Valor do serviço em reais (taxa de administração). */
  valor: number;
  descricao: string;
  agora?: Date;
}

export interface FocusInfo { status: FocusStatus; numero: string | null; pdf: string | null; xml: string | null; erro: string | null }

const REF = /^[A-Za-z0-9_-]{6,80}$/;

function json(body: string): Record<string, unknown> {
  try { const parsed = JSON.parse(body); return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}; } catch { return {}; }
}
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** Data no horário de Brasília (UTC-3, sem horário de verão), no formato aceito pela Focus: 2026-11-05T10:30:00-0300. */
export function brazilStamp(date: Date): { dataEmissao: string; competencia: string } {
  const local = new Date(date.getTime() - 3 * 3_600_000);
  const iso = local.toISOString();
  return { dataEmissao: `${iso.slice(0, 19)}-0300`, competencia: iso.slice(0, 10) };
}

export function mapFocusStatus(status?: string | null): FocusStatus {
  switch (status) {
    case 'autorizado': return 'emitida';
    case 'erro_autorizacao': return 'erro';
    case 'cancelado': return 'cancelada';
    default: return 'aguardando';
  }
}

/** Corpo do POST /v2/nfsen conforme o exemplo de Brasília/DF no guia da Focus NFe. */
export function buildFocusBody(input: FocusEmitInput) {
  const { issuer, tomador } = input;
  const { dataEmissao, competencia } = brazilStamp(input.agora ?? new Date());
  const address = tomador.endereco;
  return {
    data_emissao: dataEmissao,
    data_competencia: competencia,
    codigo_municipio_emissora: Number(issuer.codigoMunicipio),
    cnpj_prestador: issuer.cnpj,
    inscricao_municipal_prestador: issuer.inscricaoMunicipal,
    codigo_opcao_simples_nacional: issuer.opcaoSimples,
    regime_especial_tributacao: 0,
    ...(issuer.opcaoSimples === 3 ? { regime_tributario_simples_nacional: '1' } : {}),
    cpf_tomador: tomador.cpf,
    razao_social_tomador: tomador.nome,
    ...(tomador.email ? { email_tomador: tomador.email } : {}),
    ...(tomador.telefone ? { telefone_tomador: tomador.telefone } : {}),
    ...(address ? {
      codigo_municipio_tomador: Number(address.codigoMunicipio),
      cep_tomador: address.cep,
      logradouro_tomador: address.logradouro,
      numero_tomador: address.numero,
      ...(address.complemento ? { complemento_tomador: address.complemento } : {}),
      bairro_tomador: address.bairro,
    } : {}),
    codigo_municipio_prestacao: Number(issuer.codigoMunicipio),
    codigo_tributacao_nacional_iss: issuer.codigoTributacaoNacional,
    ...(issuer.codigoTributacaoMunicipal ? { codigo_tributacao_municipal_iss: issuer.codigoTributacaoMunicipal } : {}),
    descricao_servico: input.descricao,
    valor_servico: Math.round(input.valor * 100) / 100,
    tributacao_iss: 1,
    tipo_retencao_iss: 1,
    percentual_total_tributos_simples_nacional: issuer.percentualTributos,
    ...(issuer.nbs ? { codigo_nbs: issuer.nbs } : {}),
    // Grupo da reforma tributária (IBS/CBS): ou vai completo, ou não vai. Mandar "indicador do destinatário" sem o
    // "indicador da operação" faz o fisco recusar a nota (erro cIndOp/indDest).
    ...(issuer.indicadorOperacao ? {
      codigo_indicador_operacao: issuer.indicadorOperacao,
      ...(issuer.ibsCbsSituacao ? { ibs_cbs_situacao_tributaria: issuer.ibsCbsSituacao } : {}),
      ...(issuer.ibsCbsClassificacao ? { ibs_cbs_classificacao_tributaria: issuer.ibsCbsClassificacao } : {}),
      finalidade_emissao: 0,
      consumidor_final: 1,
      indicador_destinatario: 0,
    } : {}),
  };
}

/**
 * Brasília/DF (IBGE 5300108) exige o código de tributação municipal, que no padrão nacional tem EXATAMENTE 3 números (cTribMun).
 * Sem NFSE_TRIB_MUNICIPAL, usa 001 (o primeiro código do serviço; 000 o fisco não aceita). Se o DF não tiver esse código para o
 * serviço, a Focus devolve "código inexistente" e o valor certo vai em NFSE_TRIB_MUNICIPAL.
 */
export function defaultMunicipalCode(ibge: string, nacional: string): string | undefined {
  return ibge === '5300108' && /^\d{6}$/.test(nacional) ? '001' : undefined;
}

/** Item 19.01 da lista de serviços (venda de bilhetes e produtos de loteria): a tabela oficial de correlação liga ao NBS 1.0905.11.00. Só preenche sozinho para esse item; os demais exigem NFSE_NBS. */
export function defaultNbs(nacional: string): string | undefined {
  return nacional === '190101' || nacional === '190102' ? '109051100' : undefined;
}

/**
 * Grupo IBS/CBS (reforma tributária) para o item 19.01, igual ao exemplo oficial da Focus para Brasília e à tabela de correlação:
 * indicador da operação 100301, CST 000 e classificação 000001. A validação do DF recusa a nota com o grupo ausente ou incompleto,
 * então ele vai sempre completo. NFSE_INDICADOR_OPERACAO, NFSE_IBS_CBS_CST e NFSE_IBS_CBS_CLASS têm prioridade se preenchidas.
 */
export function defaultIbsCbs(nacional: string): { indicadorOperacao: string; ibsCbsSituacao: string; ibsCbsClassificacao: string } | undefined {
  return nacional === '190101' || nacional === '190102' ? { indicadorOperacao: '100301', ibsCbsSituacao: '000', ibsCbsClassificacao: '000001' } : undefined;
}

/** Traduz a recusa técnica (validação do XML) para o que falta preencher, em português simples. Devolve vazio se não reconhece. */
export function explainFocusError(raw: string): string {
  const text = raw.toLowerCase();
  const hints: string[] = [];
  if (text.includes('ctribmun') && text.includes('pattern')) hints.push('O código de tributação municipal precisa ter exatamente 3 números (NFSE_TRIB_MUNICIPAL, ex.: 001).');
  else if (text.includes('ctribmun')) hints.push('Falta o código de tributação municipal do serviço (NFSE_TRIB_MUNICIPAL, 3 números).');
  if (/e0314|e0315|tributa[cç][aã]o municipal inexistente|c[oó]digo de tributa[cç][aã]o municipal/.test(text) && !text.includes('pattern')) hints.push('O DF não reconhece esse código de tributação municipal para o serviço. Veja o código certo na lista do Emissor Nacional (nota de teste, campo "código de tributação municipal") ou com o contador e coloque em NFSE_TRIB_MUNICIPAL (3 números, nunca 000).');
  if (text.includes('cindop') || text.includes('inddest') || text.includes('ibscbs')) hints.push('O fisco recusou o grupo da reforma tributária (IBS/CBS): ele precisa ir completo (indicador da operação, CST e classificação, além do NBS). Confira NFSE_TRIB_NACIONAL=190101 ou preencha NFSE_NBS, NFSE_INDICADOR_OPERACAO, NFSE_IBS_CBS_CST e NFSE_IBS_CBS_CLASS.');
  if (/inscri[cç][aã]o (municipal|do prestador)|cf\/df/.test(text)) hints.push('Confira a inscrição do prestador (no DF é o CF/DF, na variável NFSE_MUNICIPAL_REGISTER) e se é a mesma cadastrada na Focus.');
  if (text.includes('certificado')) hints.push('Confira o certificado digital A1 no painel da Focus (validade e senha).');
  return hints.join(' ');
}

function errorText(data: Record<string, unknown>, fallback: string): string {
  const list = Array.isArray(data.erros) ? data.erros : [];
  const parts = list.map((item) => (item && typeof item === 'object' ? text((item as Record<string, unknown>).mensagem) : null)).filter((item): item is string => Boolean(item));
  const message = parts.join(' | ') || text(data.mensagem) || text(data.mensagem_sefaz) || text(data.codigo) || fallback;
  return message.replace(/[\r\n]+/g, ' ').slice(0, 480);
}

function withHint(detail: string): string {
  const hint = explainFocusError(detail);
  return hint ? `${hint} Detalhe técnico: ${detail}` : detail;
}

export class FocusNfseClient {
  constructor(private readonly http: FocusHttp) {}

  private fail(action: string, status: number, body: string): never {
    const detail = errorText(json(body), body.slice(0, 200));
    if (status === 401 || status === 403) throw new ServiceUnavailableException(`A Focus NFe recusou o token ao ${action} (HTTP ${status}). Confira NFSE_FOCUS_TOKEN e o ambiente (homologação ou produção).`);
    if (status === 400 || status === 404 || status === 409 || status === 422) {
      const hint = explainFocusError(detail);
      throw new BadRequestException(`A Focus NFe recusou ${action} (HTTP ${status}). ${hint ? `${hint} Detalhe técnico: ` : ''}${detail}`);
    }
    throw new ServiceUnavailableException(`Falha ao ${action} na Focus NFe (HTTP ${status}). ${detail}`);
  }

  async emit(ref: string, input: FocusEmitInput): Promise<FocusInfo> {
    if (!REF.test(ref)) throw new BadRequestException('Referência de NFS-e inválida.');
    const response = await this.http('POST', `/v2/nfsen?ref=${encodeURIComponent(ref)}`, buildFocusBody(input));
    if (response.status < 200 || response.status >= 300) this.fail('emitir a NFS-e', response.status, response.body);
    return this.parse(json(response.body));
  }

  async get(ref: string): Promise<FocusInfo> {
    if (!REF.test(ref)) throw new BadRequestException('Referência de NFS-e inválida.');
    const response = await this.http('GET', `/v2/nfsen/${encodeURIComponent(ref)}`);
    if (response.status !== 200) this.fail('consultar a NFS-e', response.status, response.body);
    return this.parse(json(response.body));
  }

  async cancel(ref: string, justificativa: string): Promise<void> {
    if (!REF.test(ref)) throw new BadRequestException('Referência de NFS-e inválida.');
    if (justificativa.trim().length < 15) throw new BadRequestException('O fisco exige um motivo de cancelamento com pelo menos 15 caracteres.');
    const response = await this.http('DELETE', `/v2/nfsen/${encodeURIComponent(ref)}`, { justificativa: justificativa.trim().slice(0, 255) });
    if (response.status < 200 || response.status >= 300) this.fail('cancelar a NFS-e', response.status, response.body);
  }

  private parse(data: Record<string, unknown>): FocusInfo {
    const status = mapFocusStatus(text(data.status));
    return {
      status,
      numero: text(data.numero) ?? text(data.numero_nfse),
      // Os campos de PDF/XML mudam conforme o município; aceita os nomes usados pela Focus.
      pdf: text(data.url_danfse) ?? text(data.url) ?? text(data.caminho_pdf_nota_fiscal),
      xml: text(data.caminho_xml_nota_fiscal) ?? text(data.caminho_xml),
      erro: status === 'erro' ? withHint(errorText(data, 'O fisco recusou a nota. Confira a inscrição (CF/DF), os códigos de tributação e dados do tomador.')) : null,
    };
  }
}

/** Ambientes da Focus NFe. */
export function focusBaseUrl(env: string, override = ''): string {
  if (override) return override.replace(/\/$/, '');
  return env === 'producao' ? 'https://api.focusnfe.com.br' : 'https://homologacao.focusnfe.com.br';
}

/** Chamada real: token como usuário do Basic Auth e senha vazia. Caminhos relativos devolvidos pela Focus viram links completos. */
export function focusFetch(token: string, env: string, timeoutMs = 20_000, baseOverride = ''): FocusHttp {
  const base = focusBaseUrl(env, baseOverride);
  return async (method, path, body) => {
    try {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: { authorization: `Basic ${Buffer.from(`${token}:`).toString('base64')}`, ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const raw = await response.text();
      // Links relativos (ex.: /arquivos/...) apontam para o domínio da Focus.
      return { status: response.status, body: raw.replace(/"(\/(?:arquivos|notas_fiscais|v2)[^"]*)"/g, (_m, p: string) => `"${base}${p}"`) };
    } catch (error) {
      throw new ServiceUnavailableException(`Não foi possível falar com a Focus NFe: ${(error as Error).message}`);
    }
  };
}
