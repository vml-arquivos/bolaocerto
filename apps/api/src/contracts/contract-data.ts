/**
 * Dados que o afiliado precisa completar antes de assinar o contrato e o aditivo.
 * Parte fica no cadastro do usuário (telefone, nascimento, endereço) e parte em afiliados.dados_contrato.
 */

export const ESTADOS_CIVIS = ['solteiro(a)', 'casado(a)', 'divorciado(a)', 'separado(a)', 'viúvo(a)', 'união estável'] as const;
export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'] as const;

export type ExtraContractData = { rg?: string | null; rgOrgao?: string | null; rgUf?: string | null; nacionalidade?: string | null; estadoCivil?: string | null; profissao?: string | null };

export type ContractUserData = {
  nome: string; cpf: string; email: string; telefone: string | null; dataNascimento: Date | null;
  enderecoCep: string | null; enderecoLogradouro: string | null; enderecoNumero: string | null; enderecoComplemento: string | null;
  enderecoBairro: string | null; enderecoCidade: string | null; enderecoUf: string | null;
};

export const FIELD_LABELS: Record<string, string> = {
  nome: 'Nome completo', cpf: 'CPF', dataNascimento: 'Data de nascimento', telefone: 'Celular', rg: 'Número do RG', rgOrgao: 'Órgão emissor do RG',
  nacionalidade: 'Nacionalidade', estadoCivil: 'Estado civil', profissao: 'Profissão', enderecoCep: 'CEP', enderecoLogradouro: 'Rua / avenida',
  enderecoNumero: 'Número', enderecoBairro: 'Bairro', enderecoCidade: 'Cidade', enderecoUf: 'UF',
};

/** Lê o JSON salvo em afiliados.dados_contrato, aceitando só textos curtos. */
export function readExtra(raw: unknown): ExtraContractData {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const text = (key: string, max: number) => (typeof value[key] === 'string' ? (value[key] as string).trim().slice(0, max) || null : null);
  return { rg: text('rg', 20), rgOrgao: text('rgOrgao', 20), rgUf: text('rgUf', 2), nacionalidade: text('nacionalidade', 40), estadoCivil: text('estadoCivil', 30), profissao: text('profissao', 60) };
}

/** "SSP/DF" a partir do órgão e da UF (sem repetir a UF se já vier junto). */
export function rgIssuer(extra: ExtraContractData): string | null {
  const org = (extra.rgOrgao ?? '').trim().toUpperCase();
  const uf = (extra.rgUf ?? '').trim().toUpperCase();
  if (!org) return null;
  if (!uf || org.endsWith(`/${uf}`) || org.endsWith(` ${uf}`) || org.endsWith(`-${uf}`)) return org;
  return `${org}/${uf}`;
}

function cpfOk(cpf: string): boolean {
  const d = (cpf ?? '').replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digit = (len: number) => { let sum = 0; for (let i = 0; i < len; i += 1) sum += Number(d[i]) * (len + 1 - i); const rest = (sum * 10) % 11; return rest === 10 ? 0 : rest; };
  return digit(9) === Number(d[9]) && digit(10) === Number(d[10]);
}

/** Campos que ainda faltam para assinar (lista de chaves de FIELD_LABELS). */
export function missingFields(user: ContractUserData, extra: ExtraContractData): string[] {
  const missing: string[] = [];
  if (!user.nome || user.nome.trim().split(/\s+/).length < 2) missing.push('nome');
  if (!cpfOk(user.cpf)) missing.push('cpf');
  if (!user.dataNascimento) missing.push('dataNascimento');
  const phone = (user.telefone ?? '').replace(/\D/g, '');
  if (phone.length < 10 || phone.length > 11) missing.push('telefone');
  if (!extra.rg || extra.rg.replace(/[^0-9A-Za-z]/g, '').length < 4) missing.push('rg');
  if (!extra.rgOrgao) missing.push('rgOrgao');
  if (!extra.nacionalidade) missing.push('nacionalidade');
  if (!extra.estadoCivil) missing.push('estadoCivil');
  if (!extra.profissao) missing.push('profissao');
  if ((user.enderecoCep ?? '').replace(/\D/g, '').length !== 8) missing.push('enderecoCep');
  for (const key of ['enderecoLogradouro', 'enderecoNumero', 'enderecoBairro', 'enderecoCidade'] as const) if (!user[key]?.trim()) missing.push(key);
  if (!user.enderecoUf || !(UFS as readonly string[]).includes(user.enderecoUf.toUpperCase())) missing.push('enderecoUf');
  return missing;
}
