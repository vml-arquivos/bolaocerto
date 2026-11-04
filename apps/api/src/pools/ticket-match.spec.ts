import { BadRequestException } from '@nestjs/common';
import { assertTicketMatchesPool } from './ticket-match';

const games = [{ ordem: 1, numeros: [3, 12, 24, 36, 47, 58] }, { ordem: 2, numeros: [1, 2, 3, 4, 5, 6] }];

describe('conferência do comprovante com os jogos do bolão', () => {
  it('aceita os mesmos jogos em qualquer ordem de jogos e de dezenas', () => {
    expect(() => assertTicketMatchesPool(games, [[6, 5, 4, 3, 2, 1], [58, 47, 36, 24, 12, 3]], 'megasena')).not.toThrow();
  });
  it('exige que o comprovante seja digitado', () => {
    expect(() => assertTicketMatchesPool(games, undefined, 'megasena')).toThrow(BadRequestException);
    expect(() => assertTicketMatchesPool(games, [], 'megasena')).toThrow(/comprovante/);
  });
  it('recusa um número diferente e diz qual jogo não bate', () => {
    expect(() => assertTicketMatchesPool(games, [[3, 12, 24, 36, 47, 59], [1, 2, 3, 4, 5, 6]], 'megasena')).toThrow(/fora do bolão: \[03 12 24 36 47 59\].*jogo 1/);
  });
  it('recusa jogo a mais ou a menos', () => {
    expect(() => assertTicketMatchesPool(games, [[1, 2, 3, 4, 5, 6]], 'megasena')).toThrow(/jogo 1/);
    expect(() => assertTicketMatchesPool(games, [...games.map((g) => g.numeros), [9, 9, 9, 9, 9, 9]], 'megasena')).toThrow(/fora do bolão/);
  });
  it('recusa jogo repetido no lugar de um jogo diferente', () => {
    expect(() => assertTicketMatchesPool(games, [[1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6]], 'megasena')).toThrow(BadRequestException);
  });
  it('na Super Sete a ordem das colunas importa', () => {
    const sete = [{ ordem: 1, numeros: [1, 2, 3, 4, 5, 6, 7] }];
    expect(() => assertTicketMatchesPool(sete, [[7, 6, 5, 4, 3, 2, 1]], 'supersete')).toThrow(BadRequestException);
    expect(() => assertTicketMatchesPool(sete, [[1, 2, 3, 4, 5, 6, 7]], 'supersete')).not.toThrow();
  });
  it('recusa número inválido', () => {
    expect(() => assertTicketMatchesPool(games, [[1, 2, 3, 4, 5, Number.NaN]], 'megasena')).toThrow(/inválido/);
  });
});
