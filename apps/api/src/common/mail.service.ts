import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface MailMessage {
  messageId?: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Escapa texto para uso em HTML de e-mail. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Moldura simples e compatível com clientes de e-mail (tabelas/estilos inline). */
export function wrapEmailHtml(title: string, bodyHtml: string, button?: { label: string; url: string }): string {
  const cta = button ? `<p style="margin:24px 0"><a href="${escapeHtml(button.url)}" style="background:#0a3cd8;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;display:inline-block">${escapeHtml(button.label)}</a></p>` : '';
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f3f5fb;font-family:Arial,Helvetica,sans-serif;color:#101a3d"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;padding:28px"><tr><td><p style="margin:0 0 4px;color:#0a3cd8;font-weight:600;font-size:13px">BL — Bolão Livre</p><h1 style="margin:0 0 16px;font-size:22px;font-weight:600">${escapeHtml(title)}</h1><div style="font-size:15px;line-height:1.6">${bodyHtml}</div>${cta}<hr style="border:0;border-top:1px solid #e3e7f4;margin:24px 0"><p style="margin:0;color:#646b86;font-size:12px;line-height:1.5">Você recebeu este e-mail porque tem uma conta no BL — Bolão Livre. Plataforma independente, não oficial da CAIXA. Jogue com responsabilidade (18+).</p></td></tr></table></td></tr></table></body></html>`;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null | undefined;

  constructor(private readonly config: ConfigService) {}

  /** Há SMTP configurado? Sem ele o sistema funciona normalmente, apenas sem e-mails. */
  isConfigured(): boolean {
    return Boolean(this.config.get<string>('SMTP_HOST')?.trim());
  }

  /** Endereço público do site (para links nos e-mails). */
  publicUrl(): string {
    return (this.config.get<string>('APP_PUBLIC_URL') || this.config.get<string>('WEB_ORIGIN') || 'http://localhost:3000').replace(/\/+$/, '');
  }

  private getTransporter(): nodemailer.Transporter | null {
    if (this.transporter !== undefined) return this.transporter;
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    if (!host) { this.transporter = null; return null; }
    const port = Number(this.config.get<string>('SMTP_PORT', '587')) || 587;
    const secureRaw = this.config.get<string>('SMTP_SECURE');
    const secure = secureRaw !== undefined && secureRaw !== '' ? secureRaw === 'true' : port === 465;
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const pass = this.config.get<string>('SMTP_PASS');
    this.transporter = nodemailer.createTransport({ host, port, secure, ...(user ? { auth: { user, pass } } : {}), connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 });
    return this.transporter;
  }

  /** Dados do SMTP para o painel — nunca a senha. */
  describe() {
    const user = this.config.get<string>('SMTP_USER')?.trim() ?? '';
    const port = Number(this.config.get<string>('SMTP_PORT', '587')) || 587;
    const secureRaw = this.config.get<string>('SMTP_SECURE');
    const masked = user ? (user.includes('@') ? `${user.slice(0, 2)}***${user.slice(user.indexOf('@'))}` : `${user.slice(0, 2)}***`) : null;
    return {
      configurado: this.isConfigured(),
      servidor: this.config.get<string>('SMTP_HOST')?.trim() || null,
      porta: port,
      seguro: secureRaw !== undefined && secureRaw !== '' ? secureRaw === 'true' : port === 465,
      usuario: masked,
      temSenha: Boolean(this.config.get<string>('SMTP_PASS')),
      remetente: this.config.get<string>('MAIL_FROM') || null,
      enderecoDoSite: this.publicUrl(),
    };
  }

  /** Traduz o erro técnico do SMTP para uma frase que a equipe entende. */
  explainError(error: unknown): string {
    const code = (error as { code?: string; responseCode?: number })?.code ?? '';
    const responseCode = (error as { responseCode?: number })?.responseCode ?? 0;
    if (code === 'EAUTH' || responseCode === 535 || responseCode === 534) return 'O servidor recusou o usuário ou a senha do e-mail. Confira SMTP_USER e SMTP_PASS (em Gmail/Google Workspace use uma "senha de app").';
    if (code === 'ENOTFOUND') return 'Não encontrei o servidor de e-mail. Confira o endereço em SMTP_HOST.';
    if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ESOCKET' || code === 'ECONNECTION') return 'Não consegui conectar ao servidor de e-mail. Confira SMTP_HOST, SMTP_PORT e SMTP_SECURE (587 costuma ser "false", 465 costuma ser "true") e se o servidor libera a porta.';
    if (code === 'EENVELOPE' || responseCode === 550 || responseCode === 553) return 'O servidor aceitou a conexão, mas recusou o remetente ou o destinatário. Confira MAIL_FROM (precisa ser um endereço do seu domínio autorizado).';
    return `Falha ao enviar: ${error instanceof Error ? error.message.slice(0, 160) : 'erro desconhecido'}.`;
  }

  /** Testa a conexão e envia um e-mail de verdade. Diferente de send(), devolve o motivo da falha. */
  async sendTest(to: string): Promise<{ ok: boolean; detalhe: string }> {
    const transporter = this.getTransporter();
    if (!transporter) return { ok: false, detalhe: 'O e-mail ainda não foi ligado: falta preencher SMTP_HOST nas variáveis do servidor.' };
    try {
      await transporter.verify();
    } catch (error) {
      return { ok: false, detalhe: this.explainError(error) };
    }
    try {
      await transporter.sendMail({
        from: this.config.get<string>('MAIL_FROM') || 'BL — Bolão Livre <no-reply@localhost>', to,
        subject: 'Teste de e-mail — BL Bolão Livre',
        text: 'Se você recebeu esta mensagem, o envio de e-mails do BL está funcionando.',
        html: wrapEmailHtml('O e-mail está funcionando', '<p>Se você recebeu esta mensagem, o envio de e-mails do BL está funcionando. Avisos de pagamento, recibos e recuperação de senha vão sair por aqui.</p>'),
      });
      return { ok: true, detalhe: `E-mail de teste enviado para ${to}. Confira a caixa de entrada (e o spam).` };
    } catch (error) {
      return { ok: false, detalhe: this.explainError(error) };
    }
  }

  /** Envia o e-mail. Nunca lança: devolve false se o SMTP não estiver configurado ou falhar. */
  async send(message: MailMessage): Promise<boolean> {
    const transporter = this.getTransporter();
    if (!transporter) {
      this.logger.warn(`E-mail "${message.subject}" não enviado: SMTP_HOST não configurado.`);
      return false;
    }
    try {
      await transporter.sendMail({ from: this.config.get<string>('MAIL_FROM') || 'BL — Bolão Livre <no-reply@localhost>', messageId: message.messageId, to: message.to, subject: message.subject, text: message.text, html: message.html });
      return true;
    } catch (error) {
      this.logger.error(`Falha ao enviar e-mail "${message.subject}": ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}
