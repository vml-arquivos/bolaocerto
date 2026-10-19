/** Tipos de arquivo aceitos como comprovante. A decisão é pelo CONTEÚDO (primeiros bytes), nunca pelo nome ou pelo tipo informado. */
export interface DetectedFile { mime: string; ext: string }

export const ALLOWED_DESCRIPTION = 'PDF, PNG, JPG ou WEBP';

export function detectFileType(buffer: Buffer): DetectedFile | null {
  if (buffer.length < 12) return null;
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  if (buffer[0] === 0x89 && buffer.subarray(1, 4).toString('latin1') === 'PNG' && buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a) return { mime: 'image/png', ext: 'png' };
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

/** Nome seguro para exibir/baixar: sem caminhos, sem caracteres de controle, tamanho limitado. */
export function safeFileName(original: string | undefined, fallbackExt: string): string {
  const raw = (original ?? '').normalize('NFC');
  const base = raw.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f"<>:*?|]/g, '').replace(/\s+/g, ' ').trim();
  const name = clean.slice(-120);
  return name && name !== '.' && name !== '..' ? name : `arquivo.${fallbackExt}`;
}
