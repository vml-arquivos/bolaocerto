import { ConfigService } from '@nestjs/config';
import { MailService } from '../common/mail.service';
import { ConnectionsService } from './connections.service';

const cfg = (values: Record<string, string>) => ({ get: (key: string, fallback?: string) => values[key] ?? fallback }) as unknown as ConfigService;

describe('MailService (painel)', () => {
  it('mostra os dados do SMTP sem a senha e esconde o usuário', () => {
    const mail = new MailService(cfg({ SMTP_HOST: 'smtp.exemplo.com', SMTP_PORT: '465', SMTP_USER: 'contato@exemplo.com', SMTP_PASS: 'segredo-super', MAIL_FROM: 'BL <contato@exemplo.com>' }));
    const info = mail.describe();
    expect(info).toMatchObject({ configurado: true, servidor: 'smtp.exemplo.com', porta: 465, seguro: true, temSenha: true });
    expect(info.usuario).toBe('co***@exemplo.com');
    expect(JSON.stringify(info)).not.toContain('segredo-super');
  });
  it('sem SMTP_HOST o teste explica o que falta', async () => {
    const result = await new MailService(cfg({})).sendTest('a@b.com');
    expect(result.ok).toBe(false);
    expect(result.detalhe).toMatch(/SMTP_HOST/);
  });
  it('traduz erros comuns do servidor de e-mail', () => {
    const mail = new MailService(cfg({}));
    expect(mail.explainError(Object.assign(new Error('x'), { code: 'EAUTH', responseCode: 535 }))).toMatch(/usuário ou a senha/);
    expect(mail.explainError(Object.assign(new Error('x'), { code: 'ENOTFOUND' }))).toMatch(/SMTP_HOST/);
    expect(mail.explainError(Object.assign(new Error('x'), { code: 'ETIMEDOUT' }))).toMatch(/SMTP_PORT/);
    expect(mail.explainError(Object.assign(new Error('x'), { code: 'EENVELOPE' }))).toMatch(/MAIL_FROM/);
  });
});

describe('ConnectionsService', () => {
  it('limita testes de e-mail seguidos', async () => {
    const mail = { sendTest: jest.fn().mockResolvedValue({ ok: true, detalhe: 'ok' }) } as unknown as MailService;
    const service = new ConnectionsService({} as never, cfg({}), mail, {} as never, {} as never);
    const user = { id: 'u1', email: 'a@a.com', papel: 'admin' as const };
    expect((await service.testEmail('a@a.com', user)).ok).toBe(true);
    const second = await service.testEmail('a@a.com', user);
    expect(second.ok).toBe(false);
    expect(second.detalhe).toMatch(/Aguarde/);
  });
});

describe('MailService (Brevo)', () => {
  const { MailService } = require('../common/mail.service');
  const make = (env: Record<string, string>) => new MailService({ get: (key: string, def?: string) => env[key] ?? def } as never);
  it('reconhece a Brevo pelo servidor e explica o erro de login com as palavras da Brevo', () => {
    const mail = make({ SMTP_HOST: 'smtp-relay.brevo.com', SMTP_USER: 'abc123@smtp-brevo.com', SMTP_PASS: 'x' });
    expect(mail.provider()).toBe('Brevo');
    expect(mail.describe()).toMatchObject({ provedor: 'Brevo', servidor: 'smtp-relay.brevo.com', porta: 587, seguro: false, temSenha: true });
    expect(mail.describe().usuario).toBe('ab***@smtp-brevo.com');
    expect(mail.explainError({ code: 'EAUTH', responseCode: 535 })).toMatch(/Chave SMTP/);
    expect(mail.explainError({ responseCode: 554, message: 'Sender is not valid' })).toMatch(/validado na Brevo/);
  });
  it('outros servidores mantêm a mensagem genérica; sem servidor não há provedor', () => {
    expect(make({ SMTP_HOST: 'smtp.gmail.com' }).provider()).toBe('Gmail');
    expect(make({ SMTP_HOST: 'mail.exemplo.com' }).explainError({ code: 'EAUTH' })).toMatch(/usuário ou a senha/);
    expect(make({}).provider()).toBeNull();
  });
});

describe('nomes alternativos das variáveis de e-mail', () => {
  const alt = { SMTP_ENABLED: 'true', SMTP_HOST: 'smtp-relay.brevo.com', SMTP_PORT: '2525', SMTP_SECURE: 'false', SMTP_REQUIRE_TLS: 'true', SMTP_USER: 'c087ea001@smtp-brevo.com', SMTP_PASSWORD: 'chave', SMTP_FROM_NAME: 'Bolaolivre', SMTP_FROM_EMAIL: 'notificacoes@bolaolivre.com', SMTP_REPLY_TO: 'contato@bolaolivre.com' };
  it('aceita SMTP_PASSWORD e monta o remetente com SMTP_FROM_NAME/SMTP_FROM_EMAIL', () => {
    const info = new MailService(cfg(alt)).describe();
    expect(info.configurado).toBe(true);
    expect(info.temSenha).toBe(true);
    expect(info.remetente).toBe('Bolaolivre <notificacoes@bolaolivre.com>');
    expect(info.provedor).toBe('Brevo');
  });
  it('MAIL_FROM tem prioridade e SMTP_PASS também continua valendo', () => {
    const info = new MailService(cfg({ ...alt, SMTP_PASSWORD: undefined, SMTP_PASS: 'x', MAIL_FROM: 'BL <contato@bolaolivre.com>' } as never)).describe();
    expect(info.temSenha).toBe(true);
    expect(info.remetente).toBe('BL <contato@bolaolivre.com>');
  });
  it('SMTP_ENABLED=false desliga o envio', () => {
    expect(new MailService(cfg({ ...alt, SMTP_ENABLED: 'false' })).isConfigured()).toBe(false);
  });
});
