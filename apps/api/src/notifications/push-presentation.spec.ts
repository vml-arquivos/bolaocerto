import { presentPush, PUSH_STYLES } from './push-presentation';
import { NOTIFICATION_TITLES } from './notifications.service';

describe('presentPush', () => {
  it('põe o emoji do tipo no título e um botão de ação', () => {
    const shown = presentPush('pagamento.confirmado', 'Pagamento confirmado', 'Recebemos R$ 20,00.');
    expect(shown.titulo).toBe('✅ Pagamento confirmado');
    expect(shown.acoes).toEqual([{ action: 'abrir', title: 'Ver recibo' }]);
    expect(shown.tag).toBe('pagamento.confirmado');
    expect(shown.urgente).toBe(false);
  });
  it('cota premiada é urgente e leva imagem de destaque', () => {
    const shown = presentPush('cota.premiada', 'Você tem uma cota premiada!', 'Parabéns');
    expect(shown.urgente).toBe(true);
    expect(shown.imagem).toBe('/brand/push-hero-premio.png');
  });
  it('não duplica emoji e respeita os limites de tamanho', () => {
    const shown = presentPush('comunicado', '📣 Aviso do BL', 'x'.repeat(500));
    expect(shown.titulo).toBe('📣 Aviso do BL');
    expect(shown.mensagem).toHaveLength(300);
  });
  it('tipo desconhecido vira aviso simples, sem botão', () => {
    const shown = presentPush('qualquer.coisa', 'Aviso', 'Texto');
    expect(shown).toMatchObject({ titulo: 'Aviso', acoes: [], urgente: false, tipo: 'qualquer.coisa' });
    expect(shown.imagem).toBeUndefined();
  });
  it('todo tipo com estilo tem título padrão cadastrado', () => {
    for (const tipo of Object.keys(PUSH_STYLES)) expect(NOTIFICATION_TITLES[tipo]).toBeTruthy();
  });
});
