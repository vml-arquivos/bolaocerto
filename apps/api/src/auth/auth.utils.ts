import { BadRequestException } from '@nestjs/common';

export interface AuthUser {
  id: string;
  email: string;
  papel: 'cotista' | 'afiliado' | 'admin' | 'operacao';
}

export function normalizeCpf(value: string): string {
  return value.replace(/\D/g, '');
}

export function isValidCpf(value: string): boolean {
  const cpf = normalizeCpf(value);
  if (cpf.length !== 11 || /^([0-9])\1+$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(cpf[i]) * (10 - i);
  let digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;
  if (digit !== Number(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(cpf[i]) * (11 - i);
  digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;
  return digit === Number(cpf[10]);
}

export function assertAdult(dateOfBirth: Date): void {
  const today = new Date();
  const adultDate = new Date(Date.UTC(today.getUTCFullYear() - 18, today.getUTCMonth(), today.getUTCDate()));
  if (dateOfBirth > adultDate) {
    throw new BadRequestException('Cadastro permitido somente para maiores de 18 anos.');
  }
}
