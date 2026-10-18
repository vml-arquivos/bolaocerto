/**
 * Cliente HTTP da API de resultados da CAIXA, compartilhado pela API e pelo worker.
 * - Cabeçalhos compatíveis com o portal oficial (o firewall da CAIXA recusa clientes "sem cara de navegador").
 * - Repetição com espera para falhas transitórias (rede, 429, 5xx).
 * - Fontes alternativas (espelhos) quando a CAIXA recusa ou não responde.
 * - Diagnóstico em português com a causa real (HTTP, certificado, DNS, timeout, bloqueio).
 */
import { CaixaContestPayload, normalizeCaixaContestPayload } from './index';

export const CAIXA_DEFAULT_BASE_URL = 'https://servicebus2.caixa.gov.br/portaldeloterias/api';
export const CAIXA_DEFAULT_TIMEOUT_MS = 15_000;
export const CAIXA_BROWSER_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export type CaixaSourceKind = 'caixa' | 'fallback';

export interface CaixaSource {
  kind: CaixaSourceKind;
  /** Base informada na configuração (sem barra final). */
  base: string;
  /** Modelo da URL; {modalidade} é substituído pela modalidade. */
  template: string;
}

export interface CaixaAttempt {
  source: CaixaSourceKind;
  url: string;
  ok: boolean;
  status?: number;
  code?: string;
  latencyMs: number;
  retryable: boolean;
  error?: string;
  hint?: string;
  skipped?: boolean;
}

export interface CaixaFetchResult {
  payload: CaixaContestPayload;
  source: CaixaSourceKind;
  attempts: CaixaAttempt[];
}

export class CaixaFetchError extends Error {
  constructor(message: string, readonly attempts: CaixaAttempt[]) {
    super(message);
    this.name = 'CaixaFetchError';
  }
}

interface FetchResponseLike { ok: boolean; status: number; headers: { get(name: string): string | null }; text(): Promise<string> }
type FetchLike = (url: string, init: { signal?: unknown; headers?: Record<string, string> }) => Promise<FetchResponseLike>;

export interface CaixaFetchOptions {
  timeoutMs?: number;
  /** Repetições além da primeira tentativa, por fonte (padrão 1). */
  retries?: number;
  retryDelayMs?: number;
  userAgent?: string;
  fetchImpl?: FetchLike;
  health?: CaixaSourceHealth;
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * Monta a lista de fontes a partir das variáveis de ambiente.
 * CAIXA_FALLBACK_BASE_URL aceita várias URLs separadas por vírgula. Sem {modalidade} na URL, usa `<base>/<modalidade>/latest`
 * (formato dos espelhos públicos); com {modalidade}, a URL é usada exatamente como escrita.
 */
export function buildCaixaSources(env: Record<string, string | undefined>): CaixaSource[] {
  const primaryBase = trimSlash((env.CAIXA_API_BASE_URL ?? '').trim() || CAIXA_DEFAULT_BASE_URL);
  const sources: CaixaSource[] = [{ kind: 'caixa', base: primaryBase, template: `${primaryBase}/{modalidade}` }];
  for (const raw of (env.CAIXA_FALLBACK_BASE_URL ?? '').split(',')) {
    const value = raw.trim();
    if (!value) continue;
    const template = value.includes('{modalidade}') ? value : `${trimSlash(value)}/{modalidade}/latest`;
    sources.push({ kind: 'fallback', base: trimSlash(value), template });
  }
  return sources;
}

export function resolveCaixaTimeout(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 60_000) : CAIXA_DEFAULT_TIMEOUT_MS;
}

/** Memoriza fontes que falharam há pouco para não gastar o ciclo inteiro esperando uma fonte bloqueada. */
export class CaixaSourceHealth {
  private readonly downUntil = new Map<string, number>();
  constructor(private readonly cooldownMs = 5 * 60_000, private readonly now: () => number = Date.now) {}
  isDown(key: string): boolean { return (this.downUntil.get(key) ?? 0) > this.now(); }
  markDown(key: string): void { this.downUntil.set(key, this.now() + this.cooldownMs); }
  markUp(key: string): void { this.downUntil.delete(key); }
}

function errorDetails(error: unknown): { code?: string; message: string; timeout: boolean } {
  const err = error as { name?: string; code?: string; message?: string; cause?: { code?: string; message?: string } } | null;
  const code = err?.cause?.code ?? err?.code;
  const timeout = err?.name === 'AbortError' || err?.name === 'TimeoutError' || code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ETIMEDOUT';
  const message = err?.cause?.message ?? err?.message ?? 'falha desconhecida';
  return { code, message, timeout };
}

/** Traduz o erro técnico para uma orientação objetiva. */
export function explainCaixaFailure(input: { status?: number; code?: string; timeout?: boolean; nonJson?: boolean }): string {
  const { status, code } = input;
  if (status === 403) return 'A CAIXA (firewall Azion) recusou o acesso a partir do IP deste servidor. Configure CAIXA_FALLBACK_BASE_URL (fonte alternativa) ou hospede/saia por um IP do Brasil; enquanto isso, cadastre o concurso manualmente.';
  if (status === 404) return 'Endereço ou modalidade não encontrados na fonte. Confira CAIXA_API_BASE_URL.';
  if (status === 429) return 'Limite de requisições atingido na fonte; o sistema tenta de novo no próximo ciclo.';
  if (status && status >= 500) return 'A fonte está instável (erro do servidor). O sistema tenta de novo no próximo ciclo.';
  if (status && status >= 400) return `A fonte recusou a requisição (HTTP ${status}).`;
  if (input.nonJson) return 'A fonte respondeu algo que não é JSON (provável página de bloqueio ou manutenção).';
  if (code && /^(UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT|SELF_SIGNED_CERT|CERT_|DEPTH_ZERO_SELF_SIGNED|ERR_TLS_CERT)/.test(code)) {
    return 'Falha na verificação do certificado TLS da fonte (cadeia incompleta). Defina NODE_EXTRA_CA_CERTS apontando para o certificado intermediário; não desative a verificação TLS.';
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'Falha de DNS: o servidor não resolve o endereço da fonte. Verifique a rede/DNS do container.';
  if (input.timeout) return 'A fonte não respondeu a tempo. Aumente CAIXA_API_TIMEOUT_MS (sugestão: 20000) e confirme que o servidor tem saída HTTPS liberada.';
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'EPIPE' || (code && code.startsWith('UND_ERR'))) return 'A conexão foi recusada ou derrubada pela fonte/rede (possível bloqueio de IP ou firewall de saída).';
  return 'Falha de rede ao consultar a fonte.';
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function resolveFetch(options: CaixaFetchOptions): FetchLike {
  if (options.fetchImpl) return options.fetchImpl;
  const candidate = (globalThis as unknown as { fetch?: FetchLike }).fetch;
  if (!candidate) throw new Error('fetch indisponível neste ambiente (use Node 18+).');
  return candidate;
}

async function attemptOnce(source: CaixaSource, modalidade: string, options: CaixaFetchOptions): Promise<{ attempt: CaixaAttempt; payload?: CaixaContestPayload }> {
  const url = source.template.replace('{modalidade}', encodeURIComponent(modalidade));
  const timeoutMs = options.timeoutMs ?? CAIXA_DEFAULT_TIMEOUT_MS;
  const Controller = (globalThis as unknown as { AbortController: new () => { signal: unknown; abort(): void } }).AbortController;
  const controller = new Controller();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  const headers: Record<string, string> = source.kind === 'caixa'
    ? {
        accept: 'application/json, text/plain, */*',
        'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
        'user-agent': options.userAgent || CAIXA_BROWSER_USER_AGENT,
        referer: 'https://loterias.caixa.gov.br/',
      }
    : { accept: 'application/json', 'user-agent': 'BL-Bolao-Livre/1.0' };
  try {
    const response = await resolveFetch(options)(url, { signal: controller.signal, headers });
    const body = await response.text();
    const latencyMs = Date.now() - started;
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      return { attempt: { source: source.kind, url, ok: false, status: response.status, latencyMs, retryable, error: `HTTP ${response.status}`, hint: explainCaixaFailure({ status: response.status }) } };
    }
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      const snippet = body.replace(/\s+/g, ' ').slice(0, 120);
      return { attempt: { source: source.kind, url, ok: false, status: response.status, latencyMs, retryable: false, error: `Resposta não é JSON: ${snippet}`, hint: explainCaixaFailure({ nonJson: true }) } };
    }
    const payload = normalizeCaixaContestPayload(json);
    return { attempt: { source: source.kind, url, ok: true, status: response.status, latencyMs, retryable: false }, payload };
  } catch (error) {
    const details = errorDetails(error);
    return { attempt: { source: source.kind, url, ok: false, code: details.code, latencyMs: Date.now() - started, retryable: true, error: details.timeout ? `Tempo esgotado (${timeoutMs} ms)` : details.message, hint: explainCaixaFailure({ code: details.code, timeout: details.timeout }) } };
  } finally {
    clearTimeout(timer);
  }
}

/** Consulta a modalidade na CAIXA e, se necessário, nas fontes alternativas. Lança CaixaFetchError com o histórico de tentativas. */
export async function fetchCaixaContest(modalidade: string, sources: CaixaSource[], options: CaixaFetchOptions = {}): Promise<CaixaFetchResult> {
  const attempts: CaixaAttempt[] = [];
  const retries = Math.max(0, options.retries ?? 1);
  const retryDelayMs = options.retryDelayMs ?? 600;
  const health = options.health;
  // Se todas as fontes estiverem "em descanso", tenta todas mesmo assim.
  const allDown = !!health && sources.every((source) => health.isDown(source.base));

  for (const source of sources) {
    if (health && !allDown && health.isDown(source.base)) {
      attempts.push({ source: source.kind, url: source.template.replace('{modalidade}', modalidade), ok: false, latencyMs: 0, retryable: false, skipped: true, error: 'Fonte em descanso após falhas recentes', hint: 'Será tentada novamente em alguns minutos.' });
      continue;
    }
    for (let attemptNumber = 0; attemptNumber <= retries; attemptNumber += 1) {
      const { attempt, payload } = await attemptOnce(source, modalidade, options);
      attempts.push(attempt);
      if (attempt.ok && payload) {
        health?.markUp(source.base);
        return { payload, source: source.kind, attempts };
      }
      if (!attempt.retryable || attemptNumber === retries) break;
      await sleep(retryDelayMs * 2 ** attemptNumber);
    }
    health?.markDown(source.base);
  }

  const real = attempts.filter((attempt) => !attempt.skipped);
  const last = real[real.length - 1] ?? attempts[attempts.length - 1];
  throw new CaixaFetchError(`${modalidade}: ${last?.error ?? 'sem resposta'}${last?.hint ? ` — ${last.hint}` : ''}`, attempts);
}
