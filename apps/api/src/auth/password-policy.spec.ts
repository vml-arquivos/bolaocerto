import 'reflect-metadata';
import { validate } from 'class-validator';
import { isValidNewPassword } from './password-policy';
import { RegisterDto } from './auth.dto';

describe('new password policy (mínimo 6, com letra e número)', () => {
  it.each(['abc123', 'Senha2026', 'a1b2c3d4e5f6g7h8i9', 'minha senha 42', 'Çafé123', '1234567890abcdef1234567890'])('accepts %s', (password) => {
    expect(isValidNewPassword(password)).toBe(true);
  });

  it('accepts long passwords (the person picks the length)', () => {
    expect(isValidNewPassword('a1' + 'x'.repeat(100))).toBe(true);
  });

  it.each(['abc12', '123456', '12345678', 'abcdefgh', 'ABCDEF', '', '      '])('rejects %j', (password) => {
    expect(isValidNewPassword(password)).toBe(false);
  });

  it('o cadastro exige repetir a senha e aceitar termos e LGPD', async () => {
    const dto = Object.assign(new RegisterDto(), { nome: 'Pessoa Nova', cpf: '52998224725', email: 'novo@example.com', dataNascimento: '1990-01-01', telefone: '11912345678', senha: 'abc123' });
    const props = (await validate(dto)).map((e) => e.property);
    expect(props).toEqual(expect.arrayContaining(['confirmarSenha', 'aceiteTermos', 'aceitePrivacidade']));
  });

  it('rejects absurdly long values (hash abuse guard)', () => {
    expect(isValidNewPassword('a1' + 'x'.repeat(200))).toBe(false);
  });

  it('the registration DTO enforces the same rule', async () => {
    const base = { nome: 'Pessoa Nova', cpf: '52998224725', email: 'novo@example.com', dataNascimento: '1990-01-01', telefone: '11912345678' };
    const make = (senha: string) => Object.assign(new RegisterDto(), { ...base, senha, confirmarSenha: senha, aceiteTermos: true, aceitePrivacidade: true });
    expect(await validate(make('abc123'))).toHaveLength(0);
    expect((await validate(make('123456'))).some(e => e.property === 'senha')).toBe(true);
    expect((await validate(make('abcdef'))).some(e => e.property === 'senha')).toBe(true);
    expect((await validate(make('ab1'))).some(e => e.property === 'senha')).toBe(true);
  });
});
