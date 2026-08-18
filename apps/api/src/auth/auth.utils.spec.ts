import { BadRequestException } from '@nestjs/common';
import { assertAdult, isValidCpf, normalizeCpf } from './auth.utils';

describe('auth utils', () => {
  it('normaliza e valida CPF', () => {
    expect(normalizeCpf('529.982.247-25')).toBe('52998224725');
    expect(isValidCpf('52998224725')).toBe(true);
    expect(isValidCpf('52998224724')).toBe(false);
  });

  it('bloqueia menor de 18 anos', () => {
    const minor = new Date();
    minor.setFullYear(minor.getFullYear() - 17);
    expect(() => assertAdult(minor)).toThrow(BadRequestException);
  });
});
