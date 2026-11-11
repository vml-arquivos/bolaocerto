export type CepAddress = { cep: string; logradouro: string; bairro: string; cidade: string; uf: string };

/** Busca rua, bairro, cidade e UF pelo CEP (o servidor consulta ViaCEP e, se falhar, BrasilAPI). */
export async function fetchCep(cep: string): Promise<CepAddress | null> {
  const digits = cep.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  try {
    const response = await fetch(`/api/v1/cep/${digits}`, { cache: 'no-store' });
    return response.ok ? await response.json() as CepAddress : null;
  } catch { return null; }
}

/**
 * Para o campo de CEP de um formulário de endereço: com 8 números, preenche rua, bairro, cidade e UF
 * (campos com name logradouro, bairro, cidade, uf no mesmo formulário) e leva o cursor ao número.
 * Devolve a mensagem para mostrar (vazia quando deu certo).
 */
export async function fillAddressFromCep(input: HTMLInputElement): Promise<string> {
  const digits = input.value.replace(/\D/g, '');
  if (digits.length !== 8 || input.dataset.cepLoaded === digits) return '';
  input.dataset.cepLoaded = digits;
  const form = input.form;
  const found = await fetchCep(digits);
  if (!form) return '';
  if (!found) return 'CEP não encontrado. Confira os números ou preencha o endereço à mão.';
  const set = (name: string, value: string) => {
    const field = form.elements.namedItem(name);
    if (field instanceof HTMLInputElement && value) field.value = value;
  };
  set('logradouro', found.logradouro); set('bairro', found.bairro); set('cidade', found.cidade); set('uf', found.uf);
  const numero = form.elements.namedItem('numero');
  if (numero instanceof HTMLInputElement && !numero.value) numero.focus();
  return '';
}
