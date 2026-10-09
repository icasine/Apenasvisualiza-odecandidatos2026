
import {
  TipoItemEleitoral
} from '../types/election';

export function tabelaDePartidos(ano: string | number): Record<string, string> {
  const a = Number(ano) || 9999;
  const t: Record<string, string> = {
    '10': 'REPUBLICANOS', '11': 'PP', '12': 'PDT', '13': 'PT', '15': 'MDB', '16': 'PSTU', '18': 'REDE',
    '20': 'PODE', '21': 'PCB', '22': 'PL', '23': 'CIDADANIA', '25': 'PRD', '27': 'DC', '28': 'PRTB',
    '29': 'PCO', '30': 'NOVO', '33': 'MOBILIZA', '35': 'PMB', '36': 'AGIR', '40': 'PSB', '43': 'PV',
    '44': 'UNIÃO', '45': 'PSDB', '50': 'PSOL', '55': 'PSD', '65': 'PCDOB', '70': 'AVANTE',
    '77': 'SOLIDARIEDADE', '80': 'UP'
  };
  if (a >= 2026) {
    t['14'] = 'MISSÃO';
    t['35'] = 'DEMOCRATA';
  }
  if (a <= 2022) {
    t['14'] = 'PTB';
    t['19'] = 'PODE';
    t['20'] = 'PSC';
    t['33'] = 'PMN';
    t['51'] = 'PATRIOTA';
    t['90'] = 'PROS';
    delete t['25'];
  }
  if (a <= 2020) {
    t['17'] = 'PSL';
    t['25'] = 'DEM';
    t['36'] = 'PTC';
    delete t['44'];
  }
  if (a <= 2018) {
    t['10'] = 'PRB';
    t['22'] = 'PR';
    t['23'] = 'PPS';
    t['31'] = 'PHS';
    t['44'] = 'PRP';
    t['54'] = 'PPL';
    delete t['80'];
  }
  if (a <= 2016) {
    t['15'] = 'PMDB';
    t['19'] = 'PTN';
    t['27'] = 'PSDC';
    t['70'] = 'PTDOB';
    t['77'] = 'SD';
  }
  return t;
}

export function partidoPeloNumero(numero: string, ano: string | number): string {
  const n = String(numero || '').replace(/\D/g, '');
  return n.length >= 2 ? tabelaDePartidos(ano)[n.substring(0, 2)] || '' : '';
}

export function limparNomeDeItem(nome: unknown): string {
  const original = String(nome ?? '').trim();
  const limpo = original
    .replace(/\s*\(([^)]*)\)/g, (tudo, dentro) => (/\d{2,5}/.test(dentro) ? '' : tudo))
    .replace(/\s{2,}/g, ' ')
    .trim();
  return limpo || original;
}

export function pessoaDoItem(c: { pessoa?: string; nome?: string }): string {
  return String(c.pessoa || '').trim() || limparNomeDeItem(c.nome);
}

export function chaveDaPessoa(c: { pessoa?: string; nome?: string }): string {
  return pessoaDoItem(c)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function comPartidoDoNumero<T extends { tipo?: TipoItemEleitoral; numero?: string; ano?: string | number; cargo?: string; partido?: string }>(c: T): T {
  const tipo = c.tipo || 'candidato';
  if (tipo === 'outros') return c;
  const n = String(c.numero || '').replace(/\D/g, '');
  const majoritario = String(c.cargo || '').startsWith('prefeito');
  const numeroValido = tipo === 'candidato' ? (majoritario ? n.length === 2 : n.length >= 4) : n.length === 2;
  if (!numeroValido) return c;
  const certo = partidoPeloNumero(n, String(c.ano || ''));
  if (!certo || certo === (c.partido || '')) return c;
  return { ...c, partido: certo };
}

