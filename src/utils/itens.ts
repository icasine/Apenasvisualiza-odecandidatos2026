
import {
  CandidatoArquivoData,
  CandidatoInfo,
  CargoId,
  IndiceData,
  LoteEnvio,
  SecaoVotoCandidato,
  TipoItemEleitoral
} from '../types/election';
import { commitFileToGitHub, GitHubConfig } from './githubSync';

export const CAMINHO_INDICE = 'public/data/indice.json';
export const LIMITE_AVISO_BYTES = 900 * 1024;

export const CORES_ITENS = [
  '#2563eb',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#f97316',
  '#14b8a6',
  '#ef4444'
];

export const NUMERO_DO_PARTIDO: Record<string, string> = {
  REPUBLICANOS: '10', PP: '11', PDT: '12', PT: '13', PTB: '14', MDB: '15', PSTU: '16', REDE: '18',
  PODE: '20', PCB: '21', PL: '22', CIDADANIA: '23', DC: '27', PRTB: '28', PCO: '29', NOVO: '30',
  MOBILIZA: '33', PMB: '35', AGIR: '36', PSB: '40', PV: '43', UNIÃO: '44', PSDB: '45', PSOL: '50',
  PSD: '55', PCDOB: '65', AVANTE: '70', SOLIDARIEDADE: '77', PRD: '25', UP: '80',
  MISSÃO: '14', DEMOCRATA: '35', PSL: '17', PSC: '20', DEM: '25', PMN: '33', PTC: '36', PATRIOTA: '51',
  PROS: '90', PRB: '10', PR: '22', PPS: '23', PHS: '31', PRP: '44', PPL: '54', PMDB: '15', PTN: '19',
  PSDC: '27', PTDOB: '70', SD: '77'
};

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

export function chaveDeSigla(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

const APELIDOS_DE_SIGLA: Record<string, string> = {
  PODEMOS: 'PODE',
  UNIAOBRASIL: 'UNIÃO',
  DEMOCRATAS: 'DEM',
  PATRI: 'PATRIOTA'
};

export function siglaConhecida(texto: string): string {
  const k = chaveDeSigla(texto);
  if (!k) return '';
  if (APELIDOS_DE_SIGLA[k]) return APELIDOS_DE_SIGLA[k];
  return Object.keys(NUMERO_DO_PARTIDO).find((s) => chaveDeSigla(s) === k) || '';
}

export function partidoPeloNumero(numero: string, ano: string | number): string {
  const n = String(numero || '').replace(/\D/g, '');
  return n.length >= 2 ? tabelaDePartidos(ano)[n.substring(0, 2)] || '' : '';
}

export function numeroDoPartido(sigla: string, ano: string | number): string {
  const k = chaveDeSigla(siglaConhecida(sigla) || sigla);
  if (!k) return '';
  const t = tabelaDePartidos(ano);
  const doAno = Object.keys(t).find((n) => chaveDeSigla(t[n]) === k);
  if (doAno) return doAno;
  const geral = Object.keys(NUMERO_DO_PARTIDO).find((s) => chaveDeSigla(s) === k);
  return geral ? NUMERO_DO_PARTIDO[geral] : '';
}

export function slugTexto(texto: string): string {
  return String(texto || '')
    .replace(/^﻿/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const soDigitos = (v: string): string => String(v || '').replace(/\D/g, '');

export function montarIdItem(
  ano: string,
  cargo: CargoId,
  tipo: TipoItemEleitoral | undefined,
  numero: string,
  nome: string
): string {
  const n = soDigitos(numero);
  const t = tipo || 'candidato';
  if (t === 'candidato') return `${ano}_${cargo}_${n || slugTexto(nome)}`;
  return `${ano}_${cargo}_${t}_${n || slugTexto(nome)}`;
}

export function montarCaminhoItem(ano: string, cargo: CargoId, numero: string, nome: string): string {
  const n = soDigitos(numero) || '0';
  const slug = slugTexto(nome) || 'item';
  return `data/${ano}/${cargo}/${n}-${slug}.json`;
}

export function chaveSecao(s: { zona: string; secao: string }): string {
  return `${s.zona}_${s.secao}`;
}

export function compactarSecao(s: SecaoVotoCandidato): SecaoVotoCandidato {
  const limpa: SecaoVotoCandidato = { zona: String(s.zona), secao: String(s.secao), votos: Number(s.votos) || 0 };
  const local = String(s.local_votacao_num ?? '').trim();
  if (local && local !== '0') limpa.local_votacao_num = local;
  if (s.aptos && s.aptos > 0) limpa.aptos = s.aptos;
  if (s.loteId) limpa.loteId = s.loteId;
  return limpa;
}

export function recontarLotes(lotes: LoteEnvio[], secoes: SecaoVotoCandidato[]): LoteEnvio[] {
  const contagem = new Map<string, { secoes: number; votos: number }>();
  let semLote = 0;
  secoes.forEach((s) => {
    if (!s.loteId) {
      semLote++;
      return;
    }
    const c = contagem.get(s.loteId) || { secoes: 0, votos: 0 };
    c.secoes += 1;
    c.votos += Number(s.votos) || 0;
    contagem.set(s.loteId, c);
  });

  return (lotes || []).map((l) => {
    const c = contagem.get(l.id);
    if (!c && semLote > 0) return l;
    const atuais = c || { secoes: 0, votos: 0 };
    if (atuais.secoes === l.totalSecoes && atuais.votos === l.totalVotos) return l;
    return {
      ...l,
      secoesEnviadas: l.secoesEnviadas ?? l.totalSecoes,
      votosEnviados: l.votosEnviados ?? l.totalVotos,
      totalSecoes: atuais.secoes,
      totalVotos: atuais.votos
    };
  });
}

export function loteFoiSubstituido(l: LoteEnvio): boolean {
  return l.totalSecoes === 0 && (l.secoesEnviadas ?? 0) > 0;
}

export function somarVotos(secoes: SecaoVotoCandidato[]): number {
  return secoes.reduce((acc, s) => acc + (Number(s.votos) || 0), 0);
}

export function serializarArquivoItem(dados: {
  candidatoId: string;
  nome: string;
  numero: string;
  cargo: CargoId;
  ano: string;
  tipo?: TipoItemEleitoral;
  partido?: string;
  pessoa?: string;
  secoes: SecaoVotoCandidato[];
  lotes: LoteEnvio[];
}): string {
  const secoes = dados.secoes.map(compactarSecao);
  const arquivo: Record<string, unknown> = {
    candidatoId: dados.candidatoId,
    nome: dados.nome,
    numero: dados.numero,
    cargo: dados.cargo,
    ano: dados.ano
  };
  if (dados.tipo) arquivo.tipo = dados.tipo;
  if (dados.partido) arquivo.partido = dados.partido;
  if (dados.pessoa) arquivo.pessoa = dados.pessoa;
  arquivo.totalVotos = somarVotos(secoes);
  arquivo.totalSecoes = secoes.length;
  arquivo.secoes = secoes;
  arquivo.lotes = dados.lotes;
  return JSON.stringify(arquivo);
}

export function tamanhoEmBytes(texto: string): number {
  try {
    return new TextEncoder().encode(texto).length;
  } catch {
    return texto.length;
  }
}

export function interpretarArquivoItem(texto: string | null, caminho: string): Partial<CandidatoArquivoData> | null {
  if (texto === null || texto.trim() === '') return null;
  let dados: any;
  try {
    dados = JSON.parse(texto);
  } catch {
    throw new Error(`O arquivo ${caminho} está ilegível no GitHub. Nada foi gravado. Recupere-o pelo histórico antes de continuar.`);
  }
  if (Array.isArray(dados)) return { secoes: dados, lotes: [] };
  if (!dados || typeof dados !== 'object') return null;
  return {
    ...dados,
    secoes: Array.isArray(dados.secoes) ? dados.secoes : [],
    lotes: Array.isArray(dados.lotes) ? dados.lotes : []
  };
}

export function proximaCor(usadas: string[]): string {
  const livres = CORES_ITENS.filter((c) => !usadas.includes(c));
  return livres.length > 0 ? livres[0] : CORES_ITENS[usadas.length % CORES_ITENS.length];
}

const INDICE_VAZIO: IndiceData = {
  municipio: 'Contagem',
  uf: 'MG',
  atualizacao: null,
  anos: [],
  candidatos: [],
  locais: {},
  eleitorados: {},
  agregadas: {}
};

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

export function comNomesLimpos(indice: IndiceData): IndiceData {
  return { ...indice, candidatos: indice.candidatos.map((c) => ({ ...c, nome: limparNomeDeItem(c.nome) })) };
}

export function normalizarIndice(bruto: any): IndiceData {
  const base: IndiceData = { ...INDICE_VAZIO, ...(bruto && typeof bruto === 'object' ? bruto : {}) };
  base.candidatos = Array.isArray(base.candidatos) ? base.candidatos.filter((c) => c && c.id).map(comPartidoDoNumero) : [];
  base.locais = base.locais && typeof base.locais === 'object' ? base.locais : {};
  base.eleitorados = base.eleitorados && typeof base.eleitorados === 'object' ? base.eleitorados : {};
  base.agregadas = base.agregadas && typeof base.agregadas === 'object' ? base.agregadas : {};
  base.anos = anosDoIndice(base);
  return base;
}

export function anosDoIndice(indice: IndiceData): string[] {
  const anos = new Set<string>();
  (indice.candidatos || []).forEach((c) => c.ano && anos.add(String(c.ano)));
  [indice.locais, indice.eleitorados, indice.agregadas].forEach((grupo) =>
    Object.keys(grupo || {}).forEach((a) => anos.add(String(a)))
  );
  return Array.from(anos).sort().reverse();
}

export async function atualizarIndiceNoGitHub(
  config: GitHubConfig,
  mensagem: string,
  alterar: (atual: IndiceData) => IndiceData
): Promise<IndiceData> {
  let gravado: IndiceData | null = null;
  await commitFileToGitHub(
    config,
    { path: CAMINHO_INDICE, content: '', message: mensagem },
    {
      contentUpdater: (remoto) => {
        let atual: any = null;
        if (remoto && remoto.trim()) {
          try {
            atual = JSON.parse(remoto);
          } catch {
            throw new Error(
              'O índice publicado (public/data/indice.json) está ilegível. Nada foi gravado. Use "Verificar e reparar dados" para reconstruí-lo.'
            );
          }
        }
        const novo = normalizarIndice(alterar(normalizarIndice(atual)));
        novo.atualizacao = new Date().toISOString();
        gravado = novo;
        return JSON.stringify(novo, null, 2);
      }
    }
  );
  if (!gravado) throw new Error('O índice não foi gravado.');
  return gravado;
}

export function comItemNoIndice(indice: IndiceData, item: CandidatoInfo, idAntigo?: string): IndiceData {
  const outros = indice.candidatos.filter((c) => c.id !== item.id && c.id !== idAntigo);
  return { ...indice, candidatos: [...outros, item] };
}

export function semItemNoIndice(indice: IndiceData, id: string): IndiceData {
  return { ...indice, candidatos: indice.candidatos.filter((c) => c.id !== id) };
}

export function infoAPartirDoArquivo(
  caminhoRelativo: string,
  arquivo: Partial<CandidatoArquivoData>,
  anterior: CandidatoInfo | undefined,
  coresUsadas: string[]
): CandidatoInfo {
  const secoes = (arquivo.secoes || []) as SecaoVotoCandidato[];
  const lotes = recontarLotes((arquivo.lotes || []) as LoteEnvio[], secoes);
  const chaves = new Set<string>();
  let duplicadas = 0;
  secoes.forEach((s) => {
    const k = chaveSecao(s);
    if (chaves.has(k)) duplicadas++;
    chaves.add(k);
  });
  const partes = caminhoRelativo.split('/');
  const anoPasta = partes[1] || '';
  const cargoPasta = (partes[2] || 'depfed') as CargoId;
  const ano = String(arquivo.ano || anterior?.ano || anoPasta);
  const cargo = (arquivo.cargo || anterior?.cargo || cargoPasta) as CargoId;
  const tipo = (arquivo.tipo || anterior?.tipo) as TipoItemEleitoral | undefined;
  const numero = String(arquivo.numero ?? anterior?.numero ?? '');
  const nome = String(arquivo.nome || anterior?.nome || partes[partes.length - 1].replace(/\.json$/, ''));
  const info: CandidatoInfo = {
    id: String(arquivo.candidatoId || anterior?.id || montarIdItem(ano, cargo, tipo, numero, nome)),
    ano,
    cargo,
    numero,
    nome,
    arquivo: caminhoRelativo,
    totalVotos: somarVotos(secoes),
    totalSecoes: secoes.length,
    lotes,
    cor: anterior?.cor || proximaCor(coresUsadas)
  };
  if (tipo) info.tipo = tipo;
  const partido = arquivo.partido || anterior?.partido;
  if (partido) info.partido = partido;
  const pessoa = arquivo.pessoa || anterior?.pessoa;
  if (pessoa) info.pessoa = pessoa;
  if (duplicadas > 0) {
    info.temDuplicados = true;
    info.duplicadosCount = duplicadas;
  }
  return info;
}

export interface LinhaDeLote {
  zona: string;
  secao: string;
  local_votacao_num?: string;
  votos: number;
  aptos?: number;
}

export interface ResultadoMescla {
  texto: string;
  secoes: SecaoVotoCandidato[];
  lotes: LoteEnvio[];
  adicionadas: number;
  substituidas: number;
  iguais: number;
  mantidas: number;
  semMudanca: boolean;
}

export function mesclarLoteNoArquivo(
  atual: Partial<CandidatoArquivoData> | null,
  item: {
    candidatoId: string;
    nome: string;
    numero: string;
    cargo: CargoId;
    ano: string;
    tipo?: TipoItemEleitoral;
    partido?: string;
  },
  linhas: LinhaDeLote[],
  lote: { id: string; dataHora: string; nomeArquivo: string },
  acaoConflito: 'substituir' | 'manter_antigo'
): ResultadoMescla {
  const existentes = ((atual?.secoes || []) as SecaoVotoCandidato[]).map((s) => ({ ...s }));
  const porChave = new Map<string, SecaoVotoCandidato[]>();
  existentes.forEach((s) => {
    const k = chaveSecao(s);
    if (!porChave.has(k)) porChave.set(k, []);
    porChave.get(k)!.push(s);
  });

  const remover = new Set<string>();
  const novas: SecaoVotoCandidato[] = [];
  let adicionadas = 0;
  let substituidas = 0;
  let iguais = 0;
  let mantidas = 0;

  linhas.forEach((l) => {
    const k = chaveSecao(l);
    const ja = porChave.get(k);
    const nova: SecaoVotoCandidato = {
      zona: l.zona,
      secao: l.secao,
      local_votacao_num: l.local_votacao_num,
      votos: l.votos,
      aptos: l.aptos,
      loteId: lote.id
    };
    if (!ja || ja.length === 0) {
      novas.push(nova);
      adicionadas++;
    } else if (ja.every((s) => s.votos === l.votos)) {
      iguais++;
    } else if (acaoConflito === 'substituir') {
      remover.add(k);
      novas.push(nova);
      substituidas++;
    } else {
      mantidas++;
    }
  });

  const secoes = [...existentes.filter((s) => !remover.has(chaveSecao(s))), ...novas].map(compactarSecao);
  const semMudanca = adicionadas + substituidas === 0;
  const lotesAnteriores = (atual?.lotes || []) as LoteEnvio[];
  const novoLote: LoteEnvio = {
    id: lote.id,
    dataHora: lote.dataHora,
    nomeArquivo: lote.nomeArquivo,
    totalSecoes: adicionadas + substituidas,
    totalVotos: somarVotos(novas),
    secoesEnviadas: linhas.length,
    votosEnviados: linhas.reduce((a, l) => a + l.votos, 0)
  };
  const lotes = recontarLotes(semMudanca ? lotesAnteriores : [...lotesAnteriores, novoLote], secoes);

  const texto = serializarArquivoItem({
    candidatoId: item.candidatoId,
    nome: item.nome,
    numero: item.numero,
    cargo: item.cargo,
    ano: item.ano,
    tipo: item.tipo || (atual?.tipo as TipoItemEleitoral | undefined),
    partido: item.partido || atual?.partido,
    pessoa: atual?.pessoa,
    secoes,
    lotes
  });

  return { texto, secoes, lotes, adicionadas, substituidas, iguais, mantidas, semMudanca };
}
