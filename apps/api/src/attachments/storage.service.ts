import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { createReadStream, ReadStream } from 'fs';
import { access, constants, mkdir, readdir, stat, unlink, writeFile } from 'fs/promises';
import { dirname, join, resolve, sep } from 'path';

/** Guarda os arquivos enviados em disco (volume do Docker). O banco só guarda o caminho relativo. */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly config: ConfigService) {}

  root(): string {
    return resolve(this.config.get<string>('UPLOAD_DIR') || './uploads');
  }

  maxBytes(): number {
    const mb = Number(this.config.get<string>('UPLOAD_MAX_MB') || 10);
    return Math.round((Number.isFinite(mb) && mb > 0 ? Math.min(mb, 50) : 10) * 1024 * 1024);
  }

  /** Caminho absoluto de uma chave, garantindo que nunca saia da pasta de uploads. */
  private absolute(key: string): string {
    const root = this.root();
    const full = resolve(root, key);
    if (full !== root && !full.startsWith(root + sep)) throw new InternalServerErrorException('Caminho de arquivo inválido.');
    return full;
  }

  async save(buffer: Buffer, ext: string): Promise<string> {
    const now = new Date();
    const key = join(String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, '0'), `${randomUUID()}.${ext}`);
    const full = this.absolute(key);
    try {
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, buffer, { flag: 'wx', mode: 0o640 });
    } catch (error) {
      this.logger.error(`Falha ao gravar arquivo em ${this.root()}: ${error instanceof Error ? error.message : String(error)}`);
      throw new InternalServerErrorException('Não foi possível gravar o arquivo no servidor. Avise o suporte técnico.');
    }
    return key;
  }

  open(key: string): ReadStream {
    return createReadStream(this.absolute(key));
  }

  async remove(key: string): Promise<void> {
    try { await unlink(this.absolute(key)); } catch { /* já não existe */ }
  }

  async exists(key: string): Promise<boolean> {
    try { await access(this.absolute(key), constants.R_OK); return true; } catch { return false; }
  }

  /** A pasta existe e dá para gravar nela? (usado no painel de conexões) */
  async writable(): Promise<{ ok: boolean; detalhe?: string }> {
    try {
      await mkdir(this.root(), { recursive: true });
      await access(this.root(), constants.W_OK);
      return { ok: true };
    } catch (error) {
      return { ok: false, detalhe: error instanceof Error ? error.message : String(error) };
    }
  }

  /** Quantidade de arquivos e espaço usado (varredura simples; os volumes aqui são pequenos). */
  async usage(): Promise<{ arquivos: number; bytes: number }> {
    let files = 0; let bytes = 0;
    const walk = async (dir: string, depth: number): Promise<void> => {
      let entries: string[];
      try { entries = await readdir(dir); } catch { return; }
      for (const name of entries) {
        const full = join(dir, name);
        const info = await stat(full).catch(() => null);
        if (!info) continue;
        if (info.isDirectory()) { if (depth < 4) await walk(full, depth + 1); } else { files += 1; bytes += info.size; }
      }
    };
    await walk(this.root(), 0);
    return { arquivos: files, bytes };
  }
}
