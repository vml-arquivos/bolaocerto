import { normalizePixKey } from './pix-key';

describe('chave Pix', () => {
  it('reconhece e padroniza cada tipo', () => {
    expect(normalizePixKey('529.982.247-25')).toEqual({ valor: '52998224725', tipo: 'cpf' });
    expect(normalizePixKey('Maria@Exemplo.com ')).toEqual({ valor: 'maria@exemplo.com', tipo: 'email' });
    expect(normalizePixKey('(11) 91234-5678')).toEqual({ valor: '+5511912345678', tipo: 'telefone' });
    expect(normalizePixKey('+55 11 91234-5678')).toEqual({ valor: '+5511912345678', tipo: 'telefone' });
    expect(normalizePixKey('12.345.678/0001-95')).toEqual({ valor: '12345678000195', tipo: 'cnpj' });
    expect(normalizePixKey('123E4567-E89B-12D3-A456-426614174000')).toEqual({ valor: '123e4567-e89b-12d3-a456-426614174000', tipo: 'aleatoria' });
  });
  it('recusa o que não é chave', () => {
    for (const bad of ['', '   ', 'abc', '123', '11111111111', 'maria@', 'a b@c.com', '(11) 1234-5678', '+1 555 123 4567', 'x'.repeat(200)]) expect(normalizePixKey(bad)).toBeNull();
  });
});
