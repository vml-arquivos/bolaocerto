import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { AlertService } from './alert.service';

/** Mantém a resposta padrão do Nest, mas registra em JSON e alerta (com freio) todo erro 5xx inesperado. */
@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  private readonly log = new Logger('Erro5xx');

  constructor(private readonly alerts: AlertService) { super(); }

  override catch(exception: unknown, host: ArgumentsHost): void {
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    if (status >= 500) {
      const request = host.switchToHttp().getRequest<{ method?: string; url?: string }>();
      const route = `${request?.method ?? '?'} ${(request?.url ?? '').split('?')[0]}`;
      const message = exception instanceof Error ? exception.message : String(exception);
      this.log.error(JSON.stringify({ event: 'erro.5xx', rota: route, status, mensagem: message }), exception instanceof Error ? exception.stack : undefined);
      void this.alerts.alert(`5xx:${route}`, `Erro ${status} em ${route}: ${message.slice(0, 300)}`, 15 * 60_000);
    }
    super.catch(exception, host);
  }
}
