/** Abre um arquivo protegido (precisa de login) numa nova aba, sem expor o endereço do arquivo. */
import { authenticatedFetch } from './client-api';

export const fileSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export const ATTACHMENT_LABELS: Record<string, string> = {
  comprovante_aposta: 'Comprovante da aposta',
  jogos_registrados: 'Jogos registrados',
  recibo_cota: 'Recibo da cota',
  outro: 'Outro arquivo',
};

export async function openProtectedFile(id: string): Promise<string | null> {
  const response = await authenticatedFetch(`/api/v1/anexos/${id}/arquivo`);
  if (response.status === 401) return 'Entre na sua conta para abrir este arquivo.';
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    return (Array.isArray(payload?.message) ? payload.message.join(' ') : payload?.message) || 'Não foi possível abrir o arquivo.';
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, '_blank', 'noopener');
  if (!opened) {
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? 'arquivo';
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return null;
}
