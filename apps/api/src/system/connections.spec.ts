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
