import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Envia alertas operacionais para um webhook (Slack, Discord, Telegram via bridge, Make/Zapier…).
 * Sem ALERT_WEBHOOK_URL não faz nada. Cada alerta com a mesma chave só sai de novo depois da janela (padrão 30 min),
 * para uma falha repetida não encher o canal.
 */
@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);
  private readonly lastSent = new Map<string, number>();

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean { return Boolean(this.config.get<string>('ALERT_WEBHOOK_URL')?.trim()); }

  async alert(key: string, text: string, windowMs = 30 * 60_000): Promise<boolean> {
    const url = this.config.get<string>('ALERT_WEBHOOK_URL')?.trim();
    const now = Date.now();
    if ((this.lastSent.get(key) ?? 0) + windowMs > now) return false;
    this.lastSent.set(key, now);
    if (this.lastSent.size > 500) for (const [k, t] of this.lastSent) if (t + windowMs < now) this.lastSent.delete(k);
    this.logger.warn(JSON.stringify({ event: 'alerta', chave: key, texto: text }));
    if (!url) return false;
    const label = this.config.get<string>('ALERT_ENV_LABEL') || 'BL';
    const message = `[${label}] ${text}`.slice(0, 1800);
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: message, content: message }), signal: AbortSignal.timeout(8000) });
      if (!response.ok) this.logger.error(`Webhook de alerta respondeu ${response.status}.`);
      return response.ok;
    } catch (error) {
      this.logger.error(`Falha ao enviar alerta: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}
