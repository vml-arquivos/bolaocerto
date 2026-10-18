import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NfseService } from './nfse.service';

/** Atualiza as notas pendentes e, no modo automático, emite as notas dos pagamentos confirmados. */
@Injectable()
export class NfseJob {
  private readonly logger = new Logger(NfseJob.name);
  private running = false;

  constructor(private readonly nfse: NfseService) {}

  @Cron('*/5 * * * *')
  async run() {
    if (this.running || this.nfse.mode === 'off') return;
    this.running = true;
    try {
      const sync = await this.nfse.syncPending();
      const emit = await this.nfse.autoEmit();
      if (sync.verificadas || emit.candidatos) this.logger.log(`NFS-e: ${JSON.stringify({ sync, emit })}`);
    } catch (error) {
      this.logger.error(`Rotina de NFS-e falhou: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
