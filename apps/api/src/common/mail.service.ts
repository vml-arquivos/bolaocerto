import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface MailMessage {
  messageId?: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
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
export class MailService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null | undefined;

  constructor(private readonly config: ConfigService) {}

  /** Ao subir a API, confere o login do e-mail e deixa o resultado claro nos logs (sem travar a subida). */
  onApplicationBootstrap(): void {
    if (!this.isConfigured() || process.env.NODE_ENV === 'test') return;
    const transporter = this.getTransporter();
    void transporter?.verify().then(
      () => this.logger.log(`E-mail pronto: ${this.provider() ?? 'SMTP'} em ${this.config.get<string>('SMTP_HOST')}:${this.config.get<string>('SMTP_PORT', '587')}.`),
      (error) => this.logger.error(`E-mail NÃO está funcionando: ${this.explainError(error)}`),
    );
  }

  /** Há SMTP configurado? Sem ele o sistema funciona normalmente, apenas sem e-mails. */
  isConfigured(): boolean {
    if (this.config.get<string>('SMTP_ENABLED')?.trim().toLowerCase() === 'false') return false;
    return Boolean(this.config.get<string>('SMTP_HOST')?.trim());
  }

  /** Senha do SMTP: aceita SMTP_PASS e também SMTP_PASSWORD. */
  private smtpPass(): string | undefined {
    return this.config.get<string>('SMTP_PASS') || this.config.get<string>('SMTP_PASSWORD') || undefined;
  }

  /** Remetente: MAIL_FROM, ou então SMTP_FROM_NAME + SMTP_FROM_EMAIL. */
  private fromAddress(): string {
    const explicit = this.config.get<string>('MAIL_FROM')?.trim();
    if (explicit) return explicit;
    const email = this.config.get<string>('SMTP_FROM_EMAIL')?.trim();
    if (email) {
      const name = this.config.get<string>('SMTP_FROM_NAME')?.trim() || 'BL — Bolão Livre';
      return `${name.replace(/[<>"]/g, '')} <${email}>`;
    }
    return 'BL — Bolão Livre <no-reply@localhost>';
  }

  private replyTo(): string | undefined {
    return this.config.get<string>('SMTP_REPLY_TO')?.trim() || undefined;
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
    const pass = this.smtpPass();
    const requireTLS = !secure && this.config.get<string>('SMTP_REQUIRE_TLS')?.trim().toLowerCase() === 'true';
    this.transporter = nodemailer.createTransport({ host, port, secure, ...(requireTLS ? { requireTLS: true } : {}), ...(user ? { auth: { user, pass } } : {}), connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 });
    return this.transporter;
  }

  /** Nome do serviço de e-mail pelo endereço do servidor (só para explicar melhor os erros e preencher o painel). */
  provider(): 'Brevo' | 'Gmail' | 'Outro' | null {
    const host = (this.config.get<string>('SMTP_HOST') ?? '').trim().toLowerCase();
    if (!host) return null;
    if (host.includes('brevo.com') || host.includes('sendinblue.com')) return 'Brevo';
    if (host.includes('gmail.com') || host.includes('google.com')) return 'Gmail';
    return 'Outro';
  }

  /** Dados do SMTP para o painel — nunca a senha. */
  describe() {
    const user = this.config.get<string>('SMTP_USER')?.trim() ?? '';
    const port = Number(this.config.get<string>('SMTP_PORT', '587')) || 587;
    const secureRaw = this.config.get<string>('SMTP_SECURE');
    const masked = user ? (user.includes('@') ? `${user.slice(0, 2)}***${user.slice(user.indexOf('@'))}` : `${user.slice(0, 2)}***`) : null;
    return {
      configurado: this.isConfigured(),
      provedor: this.provider(),
      servidor: this.config.get<string>('SMTP_HOST')?.trim() || null,
      porta: port,
      seguro: secureRaw !== undefined && secureRaw !== '' ? secureRaw === 'true' : port === 465,
      usuario: masked,
      temSenha: Boolean(this.smtpPass()),
      remetente: this.config.get<string>('MAIL_FROM')?.trim() || this.config.get<string>('SMTP_FROM_EMAIL')?.trim() ? this.fromAddress() : null,
      enderecoDoSite: this.publicUrl(),
    };
  }

  /** Traduz o erro técnico do SMTP para uma frase que a equipe entende. */
  explainError(error: unknown): string {
    const code = (error as { code?: string; responseCode?: number })?.code ?? '';
    const responseCode = (error as { responseCode?: number })?.responseCode ?? 0;
    const brevo = this.provider() === 'Brevo';
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (brevo && (code === 'EAUTH' || responseCode === 535 || responseCode === 534)) return 'A Brevo recusou o login. Em SMTP_USER vai o "Login SMTP" (parece com 9a1b2c@smtp-brevo.com) e em SMTP_PASS vai a "Chave SMTP" — não é a senha da conta nem a chave de API. Gere uma em Brevo → SMTP e API → SMTP.';
    if (brevo && (message.includes('sender') || message.includes('not valid') || message.includes('not yet validated') || responseCode === 554)) return 'A Brevo recusou o remetente. O endereço de MAIL_FROM precisa estar validado na Brevo (Remetentes, domínios e IPs) e o domínio com os registros DKIM e SPF verificados.';
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
        from: this.fromAddress(), replyTo: this.replyTo(), to,
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
      await transporter.sendMail({ from: this.fromAddress(), replyTo: this.replyTo(), messageId: message.messageId, to: message.to, subject: message.subject, text: message.text, html: message.html, attachments: message.attachments });
      return true;
    } catch (error) {
      this.logger.error(`Falha ao enviar e-mail "${message.subject}": ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}
