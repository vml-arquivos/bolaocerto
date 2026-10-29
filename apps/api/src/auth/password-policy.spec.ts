import { isValidNewPassword } from './password-policy';

describe('new password policy', () => {
  it.each(['123456', '1234567', '12345678'])('accepts %s', (password) => {
    expect(isValidNewPassword(password)).toBe(true);
  });

  it.each(['12345', '123456789', '12345a', 'senha12', ''])('rejects %s', (password) => {
    expect(isValidNewPassword(password)).toBe(false);
  });
});
