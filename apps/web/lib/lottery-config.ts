import type { PublicContest, PublicPool } from './domain';

export type LotteryVisual = {
  key: string;
  name: string;
  eyebrow: string;
  description: string;
  art: string;
  accent: string;
  soft: string;
  icon: string;
};

const visualByModality: Record<string, LotteryVisual> = {
  megasena: {
    key: 'megasena', name: 'Mega-Sena', eyebrow: 'O grande destaque', description: 'Prêmios que fazem planos grandes começarem agora.',
    art: '/brand/lottery/mega-sena-hero.jpg', accent: '#3157ee', soft: '#e8edff', icon: 'MS',
  },
  lotofacil: {
    key: 'lotofacil', name: 'Lotofácil', eyebrow: 'Mais acessível', description: 'Uma participação simples para jogar em grupo.',
    art: '/brand/lottery/lotofacil-hero.jpg', accent: '#9f28bd', soft: '#f4e8ff', icon: 'LF',
  },
  quina: {
    key: 'quina', name: 'Quina', eyebrow: 'Foco no próximo', description: 'Escolha sua estratégia e acompanhe o concurso.',
    art: '/brand/lottery/quina-hero.jpg', accent: '#245fe2', soft: '#e7efff', icon: 'QN',
  },
  lotomania: {
    key: 'lotomania', name: 'Lotomania', eyebrow: 'Jogo de atitude', description: 'Mais possibilidades para montar sua participação.',
    art: '/brand/lottery/lotomania-hero.jpg', accent: '#d06b16', soft: '#fff1df', icon: 'LM',
  },
  timemania: {
    key: 'timemania', name: 'Timemania', eyebrow: 'Paixão em grupo', description: 'A energia do jogo com uma experiência BL.',
    art: '/brand/lottery/timemania-hero.jpg', accent: '#128c99', soft: '#e3f8f8', icon: 'TM',
  },
  diadesorte: {
    key: 'diadesorte', name: 'Dia de Sorte', eyebrow: 'Um ritual leve', description: 'Organize sua participação com clareza e confiança.',
    art: '/brand/lottery/dia-de-sorte-hero.jpg', accent: '#8560cf', soft: '#efeaff', icon: 'DS',
  },
  duplasena: {
    key: 'duplasena', name: 'Dupla Sena', eyebrow: 'Duas chances no mesmo jogo', description: 'Um único bilhete, dois sorteios para torcer.',
    art: '/brand/lottery/dupla-sena-hero.jpg', accent: '#d5457a', soft: '#ffe9f1', icon: 'DU',
  },
  supersete: {
    key: 'supersete', name: 'Super Sete', eyebrow: 'Simples e direto', description: 'Sete colunas, sete decisões rápidas de jogo.',
    art: '/brand/lottery/super-sete-hero.jpg', accent: '#0f9d8a', soft: '#e2fbf5', icon: 'S7',
  },
  loteca: {
    key: 'loteca', name: 'Loteca', eyebrow: 'Paixão pelo esporte', description: 'Aposte nos resultados da rodada com o grupo.',
    art: '/brand/lottery/loteca-hero.jpg', accent: '#c2670f', soft: '#fff0df', icon: 'LT',
  },
};

const fallbackVisual: LotteryVisual = {
  key: 'default', name: 'Loteria oficial', eyebrow: 'Catálogo BL', description: 'Acompanhe concursos oficiais com transparência.',
  art: '/brand/lottery/mega-sena-hero.jpg', accent: '#3157ee', soft: '#e8edff', icon: 'BL',
};

export function lotteryVisual(modality?: string | null) {
  return visualByModality[modality ?? ''] ?? fallbackVisual;
}

export function orderedLotteryVisuals() {
  return Object.values(visualByModality);
}

export function contestForModality(contests: PublicContest[], modality: string) {
  return contests.find((contest) => contest.modalidade === modality && new Date(contest.cutoffAt).getTime() > Date.now())
    ?? contests.find((contest) => contest.modalidade === modality);
}

export function availableModalities(pools: PublicPool[]) {
  return Array.from(new Set(pools.map((pool) => pool.concurso?.modalidade).filter(Boolean))) as string[];
}
