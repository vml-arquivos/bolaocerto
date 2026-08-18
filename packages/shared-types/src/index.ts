export const MODALIDADES_LOTERIA = [
  'megasena',
  'lotofacil',
  'quina',
  'lotomania',
  'duplasena',
  'timemania',
  'diadesorte',
  'loteca',
  'supersete',
] as const;

export type ModalidadeLoteria = (typeof MODALIDADES_LOTERIA)[number];
export type PapelUsuario = 'cotista' | 'afiliado' | 'admin' | 'operacao';
export type StatusCota = 'reservada' | 'paga' | 'registrada' | 'apurada' | 'premiada' | 'cancelada' | 'estornada';
export type StatusBolao = 'rascunho' | 'aberto' | 'fechado' | 'registrado' | 'apurado' | 'cancelado';

export interface ConcursoPublico {
  id: string;
  modalidade: ModalidadeLoteria;
  numeroConcurso: number;
  dataSorteio: string;
  cutoffAt: string;
  valorEstimadoPremio: string | null;
  acumulado: boolean;
}

export interface BolaoPublico {
  id: string;
  concursoId: string;
  grupoId: string;
  numerosApostados: number[];
  totalCotas: number;
  cotasDisponiveis: number;
  valorCota: string;
  taxaAdministracaoPct: string;
  modeloOperacional: 'mandato' | 'loterica_parceira';
  status: StatusBolao;
  teveGanhador: boolean;
}

export interface CotaPrivada {
  id: string;
  bolaoId: string;
  titularNome: string;
  status: StatusCota;
  valorPago: string | null;
  comprovanteIndividualUrl: string | null;
  faixaPremio?: string | null;
  valorPremio?: string | null;
}

export interface PagamentoCriado {
  id: string;
  status: 'pendente' | 'confirmado' | 'falhou' | 'estornado';
  valorBruto: string;
  valorTaxaAdmin: string;
  valorComissaoAfiliado: string;
  valorCustoBilhete: string;
  qrCodePix: string | null;
  pspTransactionId: string | null;
}
