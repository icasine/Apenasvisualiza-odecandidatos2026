import { commitFileToGitHub, GitHubConfig } from './githubSync';
import { fetchDataFile } from './dataLoader';
import { gravarPeloAcesso } from './acesso';

export const CAMINHO_PERFIS = 'data/perfis.json';

export const REDES: Array<{ id: string; nome: string }> = [
  { id: 'instagram', nome: 'Instagram' },
  { id: 'facebook', nome: 'Facebook' },
  { id: 'x', nome: 'X (Twitter)' },
  { id: 'tiktok', nome: 'TikTok' },
  { id: 'youtube', nome: 'YouTube' },
  { id: 'kwai', nome: 'Kwai' },
  { id: 'whatsapp', nome: 'Canal do WhatsApp' },
  { id: 'threads', nome: 'Threads' },
  { id: 'outra', nome: 'Outra' }
];

export const POSICOES: Record<number, string> = {
  1: 'Extrema direita',
  2: 'Direita',
  3: 'Centro',
  4: 'Esquerda',
  5: 'Extrema esquerda'
};

export type PosicaoTema = 'a favor' | 'contra' | 'neutro' | 'não se manifestou';
export type SituacaoGoverno = 'base' | 'oposicao' | 'independente';

export interface RedeSocial {
  rede: string;
  usuario: string;
  url?: string;
  seguidores?: number | null;
  postagens?: number | null;
  dataColeta?: string;
}

export interface Posicionamento {
  tema: string;
  posicao: PosicaoTema;
}

export interface Alinhamento {
  inicio: string;
  fim: string;
  governo: string;
  situacao: SituacaoGoverno;
}

export interface PerfilCandidato {
  pessoa: string;
  teste?: boolean;
  anoTeste?: string;
  cargoTeste?: string;
  partido?: string;
  nascimento?: string;
  foto?: string;
  situacoes?: Record<string, string>;
  bairrosAtuacao?: string[];
  sucede?: string;
  parentesco?: string;
  redes: RedeSocial[];
  posicao?: number | null;
  temas?: string[];
  pautas?: string[];
  posicionamentos?: Posicionamento[];
  impulsionamentos?: { quantidade?: number | null; gasto?: number | null; fonte?: string };
  alinhamento?: Alinhamento[];
  observacoes?: string;
  atualizadoEm?: string;
}

export interface PerfisArquivo {
  atualizacao: string;
  perfis: PerfilCandidato[];
}

export function chavePerfil(nome: string): string {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const numero = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const textos = (v: unknown): string[] => (Array.isArray(v) ? v.map((t) => String(t || '').trim()).filter(Boolean) : []);

export function validarPerfis(bruto: unknown): PerfisArquivo {
  const obj: any = bruto && typeof bruto === 'object' ? bruto : {};
  const lista: any[] = Array.isArray(obj.perfis) ? obj.perfis : [];
  const perfis: PerfilCandidato[] = lista
    .filter((p) => p && typeof p.pessoa === 'string' && p.pessoa.trim())
    .map((p) => ({
      pessoa: String(p.pessoa).trim(),
      teste: Boolean(p.teste),
      anoTeste: p.anoTeste ? String(p.anoTeste) : undefined,
      cargoTeste: p.cargoTeste ? String(p.cargoTeste) : undefined,
      partido: p.partido ? String(p.partido) : undefined,
      nascimento: p.nascimento ? String(p.nascimento) : undefined,
      foto: /^https?:\/\//i.test(String(p.foto || '').trim()) ? String(p.foto).trim() : undefined,
      situacoes: p.situacoes && typeof p.situacoes === 'object' ? Object.fromEntries(Object.entries(p.situacoes).filter(([, v]) => situacaoDoTexto(String(v))).map(([k, v]) => [k, String(v)])) : undefined,
      sucede: p.sucede ? String(p.sucede).trim() || undefined : undefined,
      parentesco: p.parentesco ? String(p.parentesco).trim() || undefined : undefined,
      bairrosAtuacao: Array.isArray(p.bairrosAtuacao) ? p.bairrosAtuacao.map((b: any) => String(b).trim()).filter(Boolean) : undefined,
      redes: (Array.isArray(p.redes) ? p.redes : [])
        .filter((r: any) => r && r.rede)
        .map((r: any) => ({
          rede: String(r.rede),
          usuario: String(r.usuario || ''),
          url: r.url ? String(r.url) : undefined,
          seguidores: numero(r.seguidores),
          postagens: numero(r.postagens),
          dataColeta: r.dataColeta ? String(r.dataColeta) : undefined
        })),
      posicao: posicao10(p),
      temas: textos(p.temas).map((t) => temaDaLista(t) || t),
      pautas: textos(p.pautas),
      posicionamentos: (Array.isArray(p.posicionamentos) ? p.posicionamentos : [])
        .filter((x: any) => x && x.tema)
        .map((x: any) => ({ tema: String(x.tema), posicao: (['a favor', 'contra', 'neutro', 'não se manifestou'].includes(x.posicao) ? x.posicao : 'não se manifestou') as PosicaoTema })),
      impulsionamentos: p.impulsionamentos
        ? { quantidade: numero(p.impulsionamentos.quantidade), gasto: numero(p.impulsionamentos.gasto), fonte: p.impulsionamentos.fonte ? String(p.impulsionamentos.fonte) : undefined }
        : undefined,
      alinhamento: (Array.isArray(p.alinhamento) ? p.alinhamento : [])
        .filter((a: any) => a && a.governo)
        .map((a: any) => ({
          inicio: String(a.inicio || ''),
          fim: String(a.fim || ''),
          governo: String(a.governo),
          situacao: (['base', 'oposicao', 'independente'].includes(a.situacao) ? a.situacao : 'independente') as SituacaoGoverno
        })),
      observacoes: p.observacoes ? String(p.observacoes) : undefined,
      atualizadoEm: p.atualizadoEm ? String(p.atualizadoEm) : undefined
    }));
  return { atualizacao: String(obj.atualizacao || ''), perfis };
}

export function idadeDe(nascimento?: string, referencia: Date = new Date()): number | null {
  if (!nascimento) return null;
  const d = new Date(nascimento + 'T12:00:00');
  if (isNaN(d.getTime())) return null;
  let idade = referencia.getFullYear() - d.getFullYear();
  const m = referencia.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && referencia.getDate() < d.getDate())) idade--;
  return idade >= 0 && idade < 130 ? idade : null;
}

export async function lerPerfis(): Promise<PerfisArquivo> {
  const bruto = await fetchDataFile<unknown>(CAMINHO_PERFIS).catch(() => null);
  return validarPerfis(bruto);
}

export function seguidoresDe(perfil: PerfilCandidato | undefined, redesLigadas?: string[]): number {
  if (!perfil) return 0;
  return perfil.redes
    .filter((r) => !redesLigadas || redesLigadas.length === 0 || redesLigadas.includes(r.rede))
    .reduce((s, r) => s + (r.seguidores || 0), 0);
}

export async function gravarPerfil(config: GitHubConfig, perfil: PerfilCandidato, remover = false): Promise<{ pendente: boolean }> {
  if (!config.token) return gravarPeloAcesso('public/' + CAMINHO_PERFIS, comPos10({ ...perfil, atualizadoEm: new Date().toISOString().slice(0, 10) }), remover);
  const chave = chavePerfil(perfil.pessoa);
  await commitFileToGitHub(
    config,
    { path: 'public/' + CAMINHO_PERFIS, content: '', message: (remover ? 'Remove perfil: ' : 'Perfil: ') + perfil.pessoa },
    {
      contentUpdater: (remoto) => {
        const atual = validarPerfis(remoto ? JSON.parse(remoto) : null);
        const outros = atual.perfis.filter((p) => chavePerfil(p.pessoa) !== chave);
        const perfis = remover ? outros : [...outros, { ...perfil, atualizadoEm: new Date().toISOString().slice(0, 10) }];
        perfis.sort((a, b) => a.pessoa.localeCompare(b.pessoa, 'pt-BR'));
        return JSON.stringify({ atualizacao: new Date().toISOString(), perfis: perfis.map(comPos10) });
      }
    }
  );
  return { pendente: false };
}

export const TEMAS: string[] = [
  'Água e abastecimento',
  'Saneamento e esgoto',
  'Enchentes e drenagem',
  'Asfalto e vias',
  'Iluminação pública',
  'Transporte e mobilidade',
  'Saúde',
  'Educação',
  'Segurança pública',
  'Assistência social',
  'Habitação',
  'Regularização fundiária',
  'Meio ambiente',
  'Limpeza urbana e lixo',
  'Esporte e lazer',
  'Cultura',
  'Emprego e renda',
  'Comércio e indústria',
  'Mulheres',
  'Juventude',
  'Pessoa idosa',
  'Pessoa com deficiência',
  'Causa animal',
  'Outros'
];

const semAcento = (t: string) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export function temaDaLista(texto: string): string | null {
  const t = semAcento(texto);
  return TEMAS.find((x) => semAcento(x) === t || semAcento(x).startsWith(t) || t.startsWith(semAcento(x).split(' ')[0])) || null;
}

export type SituacaoDemanda = 'aberta' | 'encaminhada' | 'resolvida';
export interface Demanda {
  id: string;
  nivel: 'bairro' | 'regional';
  area: string;
  categoria: string;
  descricao: string;
  gravidade: number;
  fonte?: string;
  data?: string;
  situacao: SituacaoDemanda;
  teste?: boolean;
}
export const CAMINHO_DEMANDAS = 'data/demandas.json';

export function validarDemandas(bruto: unknown): Demanda[] {
  const obj: any = bruto && typeof bruto === 'object' ? bruto : {};
  const lista: any[] = Array.isArray(obj.demandas) ? obj.demandas : [];
  return lista
    .filter((d) => d && d.area && d.categoria)
    .map((d, i) => ({
      id: String(d.id || `d${i}`),
      nivel: d.nivel === 'regional' ? 'regional' : 'bairro',
      area: String(d.area),
      categoria: String(d.categoria),
      descricao: String(d.descricao || ''),
      gravidade: [1, 2, 3].includes(Number(d.gravidade)) ? Number(d.gravidade) : 2,
      fonte: d.fonte ? String(d.fonte) : undefined,
      data: d.data ? String(d.data) : undefined,
      situacao: (['aberta', 'encaminhada', 'resolvida'].includes(d.situacao) ? d.situacao : 'aberta') as SituacaoDemanda,
      teste: Boolean(d.teste)
    }));
}

export async function lerDemandas(): Promise<Demanda[]> {
  return validarDemandas(await fetchDataFile<unknown>(CAMINHO_DEMANDAS).catch(() => null));
}

export async function gravarDemanda(config: GitHubConfig, demanda: Demanda, remover = false): Promise<{ pendente: boolean }> {
  if (!config.token) return gravarPeloAcesso('public/' + CAMINHO_DEMANDAS, demanda as any, remover);
  await commitFileToGitHub(
    config,
    { path: 'public/' + CAMINHO_DEMANDAS, content: '', message: (remover ? 'Remove demanda: ' : 'Demanda: ') + demanda.area + ' - ' + demanda.categoria },
    {
      contentUpdater: (remoto) => {
        const atuais = validarDemandas(remoto ? JSON.parse(remoto) : null).filter((d) => d.id !== demanda.id);
        const demandas = remover ? atuais : [...atuais, demanda];
        return JSON.stringify({ atualizacao: new Date().toISOString(), demandas });
      }
    }
  );
  return { pendente: false };
}

export const CAMINHO_PARTIDOS = 'data/partidos.json';
export interface PosicaoPartido {
  sigla: string;
  posicao: number;
}
export async function lerPartidos(): Promise<PosicaoPartido[]> {
  const bruto: any = await fetchDataFile<unknown>(CAMINHO_PARTIDOS).catch(() => null);
  const lista: any[] = Array.isArray(bruto?.partidos) ? bruto.partidos : [];
  return lista
    .filter((p) => p && p.sigla && posicao10(p) != null)
    .map((p) => ({ sigla: String(p.sigla).toUpperCase(), posicao: posicao10(p)! }))
    .reduce((acc: PosicaoPartido[], p, _i, todos) => {
      acc.push(p);
      Object.entries(SIGLAS_ANTIGAS).forEach(([antiga, atual]) => { if (atual === p.sigla && !todos.some((x) => x.sigla === antiga) && !acc.some((x) => x.sigla === antiga)) acc.push({ sigla: antiga, posicao: p.posicao }); });
      return acc;
    }, []);
}
export const SIGLAS_ANTIGAS: Record<string, string> = { PMDB: 'MDB', PR: 'PL', PRB: 'REPUBLICANOS', PTN: 'PODE', PSDC: 'DC', PTDOB: 'AVANTE', PEN: 'PATRIOTA', PPS: 'CIDADANIA', SD: 'SOLIDARIEDADE', PHS: 'PODE', PPL: 'PCDOB', PRP: 'PATRIOTA', PSL: 'UNIÃO', DEM: 'UNIÃO' };
export const posicao10 = (x: any): number | null => {
  if (x && x.pos10 != null && x.pos10 !== '' && isFinite(Number(x.pos10))) {
    const v = Number(x.pos10);
    if (v >= 0 && v <= 10) return Math.round(v * 2) / 2;
  }
  if (x && x.posicao != null && x.posicao !== '' && isFinite(Number(x.posicao))) {
    const l = Number(x.posicao);
    if (l >= 1 && l <= 5) return (l - 1) * 2.5;
  }
  return null;
};
export const comPos10 = (x: any): any => {
  const { posicao, ...resto } = x || {};
  return posicao != null && isFinite(Number(posicao)) ? { ...resto, pos10: Number(posicao) } : resto;
};
export const POSICOES_10 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const faixaIndice = (v: number) => Math.min(4, Math.max(0, Math.round(v / 2.5))) + 1;
export async function gravarPartidos(config: GitHubConfig, partidos: PosicaoPartido[], escala?: FaixaEscala[]): Promise<void> {
  await commitFileToGitHub(
    config,
    { path: 'public/' + CAMINHO_PARTIDOS, content: '', message: escala ? 'Posição dos partidos e cores da escala' : 'Posição política dos partidos' },
    {
      contentUpdater: (remoto) => {
        let antigo: any = {};
        try { antigo = remoto ? JSON.parse(remoto) : {}; } catch { antigo = {}; }
        return JSON.stringify({ ...antigo, atualizacao: new Date().toISOString(), partidos: partidos.map(comPos10), escala: escala || antigo.escala || undefined });
      }
    }
  );
}

export interface FaixaEscala { posicao: number; nome: string; cor: string }
export const ESCALA_PADRAO: FaixaEscala[] = [
  { posicao: 1, nome: 'Extrema direita', cor: '#1e3a8a' },
  { posicao: 2, nome: 'Direita', cor: '#3b82f6' },
  { posicao: 3, nome: 'Centro', cor: '#16a34a' },
  { posicao: 4, nome: 'Esquerda', cor: '#ec4899' },
  { posicao: 5, nome: 'Extrema esquerda', cor: '#dc2626' }
];
export function validarEscala(bruta: unknown): FaixaEscala[] {
  const lista: any[] = Array.isArray(bruta) ? bruta : [];
  return ESCALA_PADRAO.map((padrao) => {
    const f = lista.find((x) => Number(x?.posicao) === padrao.posicao);
    const cor = /^#[0-9a-f]{6}$/i.test(String(f?.cor || '')) ? String(f.cor) : padrao.cor;
    const nome = String(f?.nome || '').trim() || padrao.nome;
    return { posicao: padrao.posicao, nome, cor };
  });
}
export async function lerEscala(): Promise<FaixaEscala[]> {
  const bruto: any = await fetchDataFile<unknown>(CAMINHO_PARTIDOS).catch(() => null);
  return validarEscala(bruto?.escala);
}
export const escalaCores = (escala?: FaixaEscala[] | null) => validarEscala(escala || []).map((f) => f.cor);
export const faixaDaPosicao = (escala: FaixaEscala[] | null | undefined, posicao: number) => validarEscala(escala || []).find((f) => f.posicao === faixaIndice(posicao));
export function corDoTexto(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#0f172a' : '#ffffff';
}

export async function lerCsvDoTse(arquivo: File, aoLerLinha: (campos: Record<string, string>) => void): Promise<number> {
  const texto = new TextDecoder('latin1').decode(await arquivo.arrayBuffer());
  const linhas = texto.split(/\r?\n/);
  const separar = (l: string) => l.split(';').map((x) => x.replace(/^"|"$/g, '').trim());
  const cabecalho = separar(linhas[0] || '').map((x) => x.toUpperCase());
  let lidas = 0;
  for (let i = 1; i < linhas.length; i++) {
    if (!linhas[i]) continue;
    const v = separar(linhas[i]);
    const campos: Record<string, string> = {};
    cabecalho.forEach((h, k) => { campos[h] = v[k] ?? ''; });
    aoLerLinha(campos);
    lidas++;
  }
  return lidas;
}

export const CAMINHO_NASCIMENTOS = 'data/nascimentos.json';
const CARGO_DO_TSE: Record<string, string> = { 'DEPUTADO FEDERAL': 'depfed', 'DEPUTADO ESTADUAL': 'depest', 'VEREADOR': 'vereador', 'PREFEITO': 'prefeito' };
const MUNICIPAIS = new Set(['vereador', 'prefeito']);
export async function lerNascimentos(): Promise<Record<string, string>> {
  const bruto: any = await fetchDataFile<unknown>(CAMINHO_NASCIMENTOS).catch(() => null);
  const mapa = bruto && typeof bruto.porPessoa === 'object' && bruto.porPessoa ? bruto.porPessoa : {};
  const limpo: Record<string, string> = {};
  Object.entries(mapa).forEach(([k, v]) => { if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) limpo[k] = String(v); });
  return limpo;
}
export async function gravarNascimentos(config: GitHubConfig, porPessoa: Record<string, string>, situacoes?: Record<string, string>): Promise<void> {
  await commitFileToGitHub(
    config,
    { path: 'public/' + CAMINHO_NASCIMENTOS, content: '', message: 'Dados dos candidatos (arquivo do TSE)' },
    {
      contentUpdater: (remoto) => {
        let antigo: any = {};
        try { antigo = remoto ? JSON.parse(remoto) : {}; } catch { antigo = {}; }
        return JSON.stringify({ atualizacao: new Date().toISOString(), fonte: 'TSE, consulta_cand', porPessoa, situacoes: { ...(antigo.situacoes || {}), ...(situacoes || {}) } });
      }
    }
  );
}
export async function nascimentosDoArquivoTse(
  arquivo: File,
  itens: Array<{ ano: string | number; cargo: string; numero: string; chave: string }>,
  municipio = 'CONTAGEM'
): Promise<{ porPessoa: Record<string, string>; situacoes: Record<string, string>; lidas: number; ligadas: number }> {
  const porNumero = new Map<string, string>();
  itens.forEach((i) => porNumero.set(chaveCandidatura(i.ano, i.cargo, i.numero), i.chave));
  const porPessoa: Record<string, string> = {};
  const situacoes: Record<string, string> = {};
  let ligadas = 0;
  const lidas = await lerCsvDoTse(arquivo, (c) => {
    const cargo = CARGO_DO_TSE[(c.DS_CARGO || '').toUpperCase()];
    if (!cargo) return;
    if (MUNICIPAIS.has(cargo) && chavePerfil(c.NM_UE || '') !== chavePerfil(municipio)) return;
    const k = chaveCandidatura(c.ANO_ELEICAO, cargo, c.NR_CANDIDATO || '');
    const chave = porNumero.get(k);
    if (!chave) return;
    const sit = c.DS_SIT_TOT_TURNO || '';
    if (situacaoDoTexto(sit)) situacoes[k] = sit;
    const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(c.DT_NASCIMENTO || '');
    if (!d) return;
    if (!porPessoa[chave]) ligadas++;
    porPessoa[chave] = `${d[3]}-${d[2]}-${d[1]}`;
  });
  return { porPessoa, situacoes, lidas, ligadas };
}

export function pontoNaArea(lng: number, lat: number, geom: any): boolean {
  const polis = geom?.type === 'Polygon' ? [geom.coordinates] : geom?.coordinates || [];
  return polis.some((poli: number[][][]) => {
    const anel = poli[0] || [];
    let dentro = false;
    for (let a = 0, b = anel.length - 1; a < anel.length; b = a++) {
      const [xa, ya] = anel[a];
      const [xb, yb] = anel[b];
      if (ya > lat !== yb > lat && lng < ((xb - xa) * (lat - ya)) / (yb - ya) + xa) dentro = !dentro;
    }
    return dentro;
  });
}

export async function lerAreas(): Promise<any[]> {
  // @ts-ignore
  const mod: any = await import('../geo/contagem-bairros.json');
  const gj = mod?.default || mod;
  return Array.isArray(gj?.features) ? gj.features : [];
}

export const CAMINHO_PERFIL_ELEITORADO = 'data/perfil_eleitorado.json';
export interface PerfilEleitorado {
  ano: string;
  rotulos: { genero: string[]; idade: string[]; escolaridade: string[] };
  porSecao: Record<string, [number[], number[], number[]]>;
}
export const chaveSecao = (zona: string | number, secao: string | number) => `${String(zona).replace(/^0+/, '')}|${String(secao).replace(/^0+/, '')}`;
const FAIXAS: Array<[number, string]> = [[16, '16 a 24'], [25, '25 a 34'], [35, '35 a 44'], [45, '45 a 59'], [60, '60 a 69'], [70, '70 ou mais']];
function faixaLarga(texto: string): string {
  const n = Number((/\d+/.exec(texto) || [])[0]);
  if (!Number.isFinite(n)) return 'Não informada';
  let r = FAIXAS[0][1];
  FAIXAS.forEach(([lim, nome]) => { if (n >= lim) r = nome; });
  return r;
}
const capitalizar = (s: string) => { const t = s.toLowerCase().trim(); return t ? t[0].toUpperCase() + t.slice(1) : 'Não informado'; };
export async function lerPerfilEleitorado(): Promise<PerfilEleitorado | null> {
  const b: any = await fetchDataFile<unknown>(CAMINHO_PERFIL_ELEITORADO).catch(() => null);
  if (!b || !b.rotulos || !b.porSecao) return null;
  return b as PerfilEleitorado;
}
export async function gravarPerfilEleitorado(config: GitHubConfig, perfil: PerfilEleitorado): Promise<void> {
  await commitFileToGitHub(
    config,
    { path: 'public/' + CAMINHO_PERFIL_ELEITORADO, content: '', message: 'Perfil do eleitorado por seção (arquivo do TSE)' },
    { contentUpdater: () => JSON.stringify({ atualizacao: new Date().toISOString(), fonte: 'TSE, perfil_eleitor_secao', ...perfil }) }
  );
}
export async function perfilEleitoradoDoArquivoTse(arquivo: File, municipio = 'CONTAGEM', aoAvancar?: (fracao: number) => void): Promise<PerfilEleitorado & { linhas: number }> {
  const leitor = (arquivo.stream() as any).getReader();
  const decod = new TextDecoder('latin1');
  const alvo = chavePerfil(municipio);
  const idx: Record<string, number> = {};
  const rot = { genero: [] as string[], idade: [] as string[], escolaridade: [] as string[] };
  const pos = (lista: string[], v: string) => { let i = lista.indexOf(v); if (i < 0) { lista.push(v); i = lista.length - 1; } return i; };
  const bruto: Record<string, [number[], number[], number[]]> = {};
  let cab: string[] | null = null, resto = '', lidos = 0, linhas = 0, ano = '';
  const tratar = (linha: string) => {
    if (!linha) return;
    const v = linha.split(';').map((x) => x.replace(/^"|"$/g, '').trim());
    if (!cab) { cab = v.map((x) => x.toUpperCase()); cab.forEach((h, k) => { idx[h] = k; }); return; }
    if (chavePerfil(v[idx.NM_MUNICIPIO] || '') !== alvo) return;
    const qt = Number(v[idx.QT_ELEITORES_PERFIL]) || 0;
    if (!qt) return;
    ano = v[idx.ANO_ELEICAO] || ano;
    const k = chaveSecao(v[idx.NR_ZONA], v[idx.NR_SECAO]);
    const s = bruto[k] || (bruto[k] = [[], [], []]);
    const g = pos(rot.genero, capitalizar(v[idx.DS_GENERO] || ''));
    const f = pos(rot.idade, faixaLarga(v[idx.DS_FAIXA_ETARIA] || ''));
    const e = pos(rot.escolaridade, capitalizar(v[idx.DS_GRAU_ESCOLARIDADE] || ''));
    s[0][g] = (s[0][g] || 0) + qt; s[1][f] = (s[1][f] || 0) + qt; s[2][e] = (s[2][e] || 0) + qt;
    linhas++;
  };
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    lidos += value.length;
    aoAvancar?.(lidos / Math.max(1, arquivo.size));
    const partes = (resto + decod.decode(value, { stream: true })).split(/\r?\n/);
    resto = partes.pop() || '';
    partes.forEach(tratar);
  }
  tratar(resto + decod.decode());
  const porSecao: PerfilEleitorado['porSecao'] = {};
  Object.entries(bruto).forEach(([k, s]) => {
    porSecao[k] = [rot.genero.map((_, i) => s[0][i] || 0), rot.idade.map((_, i) => s[1][i] || 0), rot.escolaridade.map((_, i) => s[2][i] || 0)];
  });
  return { ano, rotulos: rot, porSecao, linhas };
}

export const CAMINHO_RELACOES = 'data/relacoes.json';
export type TipoRelacao = 'aliado' | 'possivel' | 'incompativel' | 'rompido';
export const TIPOS_RELACAO: Record<TipoRelacao, { nome: string; classe: string; ajuda: string }> = {
  aliado: { nome: 'Aliados', classe: 'bg-emerald-100 text-emerald-800', ajuda: 'Já caminham juntos (apoio declarado, dobradinha, mesmo grupo).' },
  possivel: { nome: 'Aliança possível', classe: 'bg-sky-100 text-sky-800', ajuda: 'Ainda não são aliados, mas há conversa ou chance real.' },
  incompativel: { nome: 'Incompatível politicamente', classe: 'bg-orange-100 text-orange-800', ajuda: 'Campos, bandeiras ou bases que não combinam.' },
  rompido: { nome: 'Brigados / rompidos', classe: 'bg-red-100 text-red-800', ajuda: 'Conflito pessoal ou político declarado.' }
};
export interface RelacaoPolitica {
  id: string;
  a: string;
  b: string;
  tipo: TipoRelacao;
  motivo?: string;
  fonte?: string;
  data?: string;
  teste?: boolean;
}
export function validarRelacoes(bruto: unknown): RelacaoPolitica[] {
  const lista: any[] = Array.isArray((bruto as any)?.relacoes) ? (bruto as any).relacoes : [];
  return lista
    .filter((r) => r && r.a && r.b && r.tipo in TIPOS_RELACAO && chavePerfil(r.a) !== chavePerfil(r.b))
    .map((r) => ({
      id: String(r.id || 'r' + Math.random().toString(36).slice(2)),
      a: String(r.a).trim(),
      b: String(r.b).trim(),
      tipo: r.tipo as TipoRelacao,
      motivo: r.motivo ? String(r.motivo) : undefined,
      fonte: r.fonte ? String(r.fonte) : undefined,
      data: r.data ? String(r.data) : undefined,
      teste: Boolean(r.teste)
    }));
}
export async function lerRelacoes(): Promise<RelacaoPolitica[]> {
  return validarRelacoes(await fetchDataFile<unknown>(CAMINHO_RELACOES).catch(() => null));
}
export async function gravarRelacao(config: GitHubConfig, rel: RelacaoPolitica, remover = false): Promise<{ pendente: boolean }> {
  if (!config.token) return gravarPeloAcesso('public/' + CAMINHO_RELACOES, rel as any, remover);
  await commitFileToGitHub(
    config,
    { path: 'public/' + CAMINHO_RELACOES, content: '', message: (remover ? 'Remove relação: ' : 'Relação: ') + rel.a + ' x ' + rel.b },
    {
      contentUpdater: (remoto) => {
        const atuais = validarRelacoes(remoto ? JSON.parse(remoto) : null).filter((r) => r.id !== rel.id);
        return JSON.stringify({ atualizacao: new Date().toISOString(), relacoes: remover ? atuais : [...atuais, rel] });
      }
    }
  );
  return { pendente: false };
}
export function relacaoEntre(relacoes: RelacaoPolitica[], x: string, y: string): RelacaoPolitica | undefined {
  const a = chavePerfil(x), b = chavePerfil(y);
  return relacoes.find((r) => { const ra = chavePerfil(r.a), rb = chavePerfil(r.b); return (ra === a && rb === b) || (ra === b && rb === a); });
}

export interface PessoaParaAlianca {
  chave: string;
  nome: string;
  partido: string;
  posicao: number | null;
  temas: string[];
  governo?: string;
  cargo?: string;
  ano?: string;
  votos: number;
  teste?: boolean;
}
export interface SugestaoAlianca { pessoa: PessoaParaAlianca; pontos: number; motivos: string[]; contras: string[] }
export function sugerirAliancas(alvo: PessoaParaAlianca, todas: PessoaParaAlianca[], relacoes: RelacaoPolitica[], limite = 8): SugestaoAlianca[] {
  const saida: SugestaoAlianca[] = [];
  todas.forEach((o) => {
    if (o.chave === alvo.chave || Boolean(o.teste) !== Boolean(alvo.teste)) return;
    const rel = relacaoEntre(relacoes, alvo.nome, o.nome);
    if (rel && rel.tipo !== 'possivel') return; // aliados, incompatíveis e rompidos aparecem em outra lista
    let pontos = 0;
    const motivos: string[] = [], contras: string[] = [];
    if (rel) { pontos += 2; motivos.push('já anotada como aliança possível'); }
    if (alvo.posicao != null && o.posicao != null) {
      const d = Math.abs(alvo.posicao - o.posicao);
      if (d <= 0.5) { pontos += 3; motivos.push('mesma posição política'); }
      else if (d <= 3) { pontos += 1.5; motivos.push('posições próximas'); }
      else if (d <= 5.5) { pontos -= 1; contras.push('posições distantes'); }
      else { pontos -= 4; contras.push('posições opostas'); }
    }
    if (alvo.partido && o.partido && alvo.partido.toUpperCase() === o.partido.toUpperCase()) { pontos += 2; motivos.push('mesmo partido'); }
    const comuns = alvo.temas.filter((t) => o.temas.includes(t));
    if (comuns.length) { pontos += Math.min(3, comuns.length); motivos.push('temas em comum: ' + comuns.slice(0, 3).join(', ')); }
    if (alvo.governo && o.governo) {
      if (alvo.governo === o.governo) { pontos += 1.5; motivos.push(alvo.governo === 'base' ? 'os dois na base do governo' : alvo.governo === 'oposicao' ? 'os dois na oposição' : 'os dois independentes'); }
      else if ((alvo.governo === 'base' && o.governo === 'oposicao') || (alvo.governo === 'oposicao' && o.governo === 'base')) { pontos -= 2; contras.push('um na base e outro na oposição'); }
    }
    if (alvo.cargo && o.cargo && alvo.ano && alvo.ano === o.ano) {
      const par = [alvo.cargo, o.cargo].sort().join('+');
      if (par === 'depest+depfed') { pontos += 2; motivos.push('dobradinha federal + estadual'); }
      else if (alvo.cargo === o.cargo) { pontos -= 1.5; contras.push('disputam o mesmo cargo'); }
    }
    if (motivos.length < 2 || pontos <= 2) return;
    saida.push({ pessoa: o, pontos, motivos, contras });
  });
  return saida.sort((x, y) => y.pontos - x.pontos || y.pessoa.votos - x.pessoa.votos).slice(0, limite);
}

export type SituacaoEleicao = 'eleito' | 'eleito_qp' | 'eleito_media' | 'segundo_turno' | 'suplente' | 'nao_eleito';
export const SITUACOES_ELEICAO: Record<SituacaoEleicao, { nome: string; classe: string }> = {
  eleito: { nome: 'Eleito', classe: 'bg-emerald-600 text-white' },
  eleito_qp: { nome: 'Eleito por QP', classe: 'bg-emerald-600 text-white' },
  eleito_media: { nome: 'Eleito por média', classe: 'bg-emerald-500 text-white' },
  segundo_turno: { nome: '2º turno', classe: 'bg-sky-600 text-white' },
  suplente: { nome: 'Suplente', classe: 'bg-amber-200 text-amber-900' },
  nao_eleito: { nome: 'Não eleito', classe: 'bg-slate-200 text-slate-700' }
};
export function situacaoDoTexto(texto: string | undefined | null): SituacaoEleicao | null {
  const s = chavePerfil(texto || '');
  if (!s) return null;
  if (s in SITUACOES_ELEICAO) return s as SituacaoEleicao;
  if (s.includes('2 turno') || s.includes('segundo turno')) return 'segundo_turno';
  if (s.includes('suplente')) return 'suplente';
  if (s.startsWith('nao eleito')) return 'nao_eleito';
  if (s.includes('media')) return 'eleito_media';
  if (s.includes('qp')) return 'eleito_qp';
  if (s.startsWith('eleito')) return 'eleito';
  return null;
}
export const chaveCandidatura = (ano: string | number, cargo: string, numero: string | number) => `${ano}|${cargo}|${String(numero).replace(/^0+/, '')}`;
export async function lerSituacoes(): Promise<Record<string, string>> {
  const saida: Record<string, string> = {};
  const mg: any = await fetchDataFile<unknown>('data/mg/indice.json').catch(() => null);
  (Array.isArray(mg?.itens) ? mg.itens : []).forEach((i: any) => { if (i?.situacao) saida[chaveCandidatura(i.ano, i.cargo, i.numero)] = /^suplente/i.test(String(i.situacao)) ? 'Não eleito' : String(i.situacao); });
  const tse: any = await fetchDataFile<unknown>(CAMINHO_NASCIMENTOS).catch(() => null);
  Object.entries(tse?.situacoes || {}).forEach(([k, v]) => { saida[k] = /^suplente/i.test(String(v)) ? 'Não eleito' : String(v); });
  return saida;
}
let fotosEmCache: Promise<Record<string, string>> | null = null;
export function lerFotos(): Promise<Record<string, string>> {
  if (!fotosEmCache) fotosEmCache = fetchDataFile<unknown>('data/fotos.json').then((b: any) => (b && b.fotos && typeof b.fotos === 'object' ? b.fotos : {})).catch(() => ({}));
  return fotosEmCache;
}
export const fotoDosItens = (fotos: Record<string, string>, itens: Array<{ ano: string | number; cargo: string; numero: string | number }>): string | undefined => {
  const ordenados = itens.slice().sort((a, b) => String(b.ano).localeCompare(String(a.ano)));
  for (const i of ordenados) { const f = fotos[chaveCandidatura(i.ano, i.cargo, i.numero)]; if (f) return f; }
  return undefined;
};

const textoOuNada = (v: unknown) => (v === undefined || v === null || String(v).trim() === '' ? undefined : String(v).trim());
const listaDeTextos = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
const numeroOuNada = (v: unknown) => { if (v === undefined || v === null || v === '') return undefined; const n = Number(v); return Number.isFinite(n) ? n : undefined; };
const temasValidos = (v: unknown) => Array.from(new Set(listaDeTextos(v).map((t) => temaDaLista(t) || t)));

async function gravarNaLista<T extends { id: string }>(config: GitHubConfig, caminho: string, campo: string, item: T, remover: boolean, validar: (b: unknown) => T[], mensagem: string, serializar: (x: any) => any = (x) => x): Promise<{ pendente: boolean }> {
  if (!config.token) return gravarPeloAcesso('public/' + caminho, serializar(item), remover);
  await commitFileToGitHub(
    config,
    { path: 'public/' + caminho, content: '', message: mensagem },
    {
      contentUpdater: (remoto) => {
        let antigo: any = {};
        try { antigo = remoto ? JSON.parse(remoto) : {}; } catch { antigo = {}; }
        const atuais = validar(antigo).filter((x) => x.id !== item.id);
        return JSON.stringify({ ...antigo, atualizacao: new Date().toISOString(), [campo]: (remover ? atuais : [...atuais, item]).map(serializar) });
      }
    }
  );
  return { pendente: false };
}

export type TipoVinculo = 'apoia' | 'afinidade' | 'oposicao';
export const TIPOS_VINCULO: Record<TipoVinculo, { nome: string; classe: string }> = {
  apoia: { nome: 'Apoia / trabalha junto', classe: 'bg-emerald-100 text-emerald-800' },
  afinidade: { nome: 'Afinidade', classe: 'bg-sky-100 text-sky-800' },
  oposicao: { nome: 'Oposição / atrito', classe: 'bg-red-100 text-red-800' }
};
export interface VinculoPolitico { pessoa: string; tipo: TipoVinculo }
const vinculosValidos = (v: unknown): VinculoPolitico[] => (Array.isArray(v) ? v : [])
  .filter((x: any) => x && x.pessoa)
  .map((x: any) => ({ pessoa: String(x.pessoa).trim(), tipo: (x.tipo in TIPOS_VINCULO ? x.tipo : 'afinidade') as TipoVinculo }));

export const ETAPAS_PROSPECCAO: Record<string, string> = { mapear: 'A conhecer', contato: 'Primeiro contato', conversa: 'Em conversa', parceria: 'Parceria firmada', perdida: 'Sem chance agora' };
export const CAMINHO_LIDERANCAS = 'data/liderancas.json';
export interface Lideranca {
  id: string;
  nome: string;
  apelido?: string;
  bairros: string[];
  lat?: number;
  lng?: number;
  perfil?: string;
  projetoSocial?: string;
  temas: string[];
  pautas: string[];
  potencialVotos?: number;
  etapa?: string;
  acao?: string;
  vinculos: VinculoPolitico[];
  posicao?: number;
  foto?: string;
  observacoes?: string;
  teste?: boolean;
}
export function validarLiderancas(bruto: unknown): Lideranca[] {
  const lista: any[] = Array.isArray((bruto as any)?.liderancas) ? (bruto as any).liderancas : [];
  return lista.filter((x) => x && x.nome).map((x) => ({
    id: String(x.id || 'l' + Math.random().toString(36).slice(2)),
    nome: String(x.nome).trim(),
    apelido: textoOuNada(x.apelido),
    bairros: listaDeTextos(x.bairros),
    lat: numeroOuNada(x.lat),
    lng: numeroOuNada(x.lng),
    perfil: textoOuNada(x.perfil),
    projetoSocial: textoOuNada(x.projetoSocial),
    temas: temasValidos(x.temas),
    pautas: listaDeTextos(x.pautas),
    potencialVotos: numeroOuNada(x.potencialVotos),
    etapa: x.etapa in ETAPAS_PROSPECCAO ? x.etapa : undefined,
    acao: textoOuNada(x.acao),
    vinculos: vinculosValidos(x.vinculos),
    posicao: posicao10(x) ?? undefined,
    foto: /^https?:\/\//i.test(String(x.foto || '')) ? String(x.foto).trim() : undefined,
    observacoes: textoOuNada(x.observacoes),
    teste: Boolean(x.teste)
  }));
}
export const lerLiderancas = async () => validarLiderancas(await fetchDataFile<unknown>(CAMINHO_LIDERANCAS).catch(() => null));
export const gravarLideranca = (config: GitHubConfig, l: Lideranca, remover = false) => gravarNaLista(config, CAMINHO_LIDERANCAS, 'liderancas', l, remover, validarLiderancas, (remover ? 'Remove liderança: ' : 'Liderança: ') + l.nome, comPos10);

export const CAMINHO_ACOES = 'data/acoes.json';
export const TIPOS_ACAO = ['Indicação', 'Ofício', 'Requerimento', 'Projeto de lei', 'Projeto de resolução', 'Moção', 'Visita', 'Reunião', 'Evento', 'Fiscalização', 'Ação social', 'Outra'];
export interface AcaoMapa {
  id: string;
  titulo: string;
  tipo?: string;
  numero?: string;
  data?: string;
  descricao?: string;
  categoria?: string;
  tema?: string;
  lat?: number;
  lng?: number;
  endereco?: string;
  situacao?: string;
  politicos: string[];
  liderancas: string[];
  fonte?: string;
  link?: string;
  pdf?: string;
  temas?: string[];
  bairro?: string;
  orgao?: string;
  aproximado?: boolean;
  regional?: string;
  arquivo?: string;
  teste?: boolean;
}
export function validarAcoes(bruto: unknown): AcaoMapa[] {
  const lista: any[] = Array.isArray((bruto as any)?.acoes) ? (bruto as any).acoes : [];
  return lista.filter((x) => x && x.titulo).map((x) => ({
    id: String(x.id || 'a' + Math.random().toString(36).slice(2)),
    titulo: String(x.titulo).trim(),
    tipo: textoOuNada(x.tipo),
    numero: textoOuNada(x.numero),
    data: textoOuNada(x.data),
    descricao: textoOuNada(x.descricao),
    categoria: textoOuNada(x.categoria),
    tema: x.tema ? temaDaLista(x.tema) || String(x.tema) : undefined,
    lat: numeroOuNada(x.lat),
    lng: numeroOuNada(x.lng),
    endereco: textoOuNada(x.endereco),
    situacao: textoOuNada(x.situacao),
    politicos: listaDeTextos(x.politicos),
    liderancas: listaDeTextos(x.liderancas),
    fonte: textoOuNada(x.fonte),
    link: textoOuNada(x.link),
    pdf: textoOuNada(x.pdf),
    temas: listaDeTextos(x.temas).length ? listaDeTextos(x.temas) : undefined,
    bairro: textoOuNada(x.bairro),
    orgao: textoOuNada(x.orgao),
    aproximado: x.aproximado ? true : undefined,
    regional: textoOuNada(x.regional),
    teste: Boolean(x.teste)
  }));
}
export const PRIMEIRO_ANO_ACOES = 2016;
export const anoDaAcao = (a: { data?: string }) => (/^\d{4}/.test(a.data || '') ? (a.data as string).slice(0, 4) : 'sem-data');
export const caminhoAcoesAno = (ano: string) => 'data/acoes/' + ano + '.json';
export const anosDeAcoes = () => { const fim = new Date().getFullYear() + 1; const l: string[] = []; for (let a = PRIMEIRO_ANO_ACOES; a <= fim; a++) l.push(String(a)); l.push('sem-data'); return l; };
let acoesEmCache: Promise<AcaoMapa[]> | null = null;
export const lerAcoes = (recarregar = false): Promise<AcaoMapa[]> => {
  if (acoesEmCache && !recarregar) return acoesEmCache;
  acoesEmCache = (async () => {
    const caminhos = [CAMINHO_ACOES, ...anosDeAcoes().map(caminhoAcoesAno)];
    const brutos = await Promise.all(caminhos.map((c) => fetchDataFile<unknown>(c).catch(() => null)));
    const porId = new Map<string, AcaoMapa>();
    brutos.forEach((b, i) => validarAcoes(b).forEach((a) => porId.set(a.id, { ...a, arquivo: caminhos[i] })));
    return Array.from(porId.values());
  })();
  return acoesEmCache;
};
const semArquivo = (a: any) => { const { arquivo, ...resto } = a || {}; return resto; };
export function completarLugar(a: AcaoMapa, areas: any[]): AcaoMapa {
  if (a.lat == null || a.lng == null || !areas.length) return a;
  const regional = regionalDoPonto(areas, a.lat, a.lng);
  if (a.aproximado && a.bairro) return { ...a, regional: regional || a.regional };
  return { ...a, bairro: bairroDoPonto(areas, a.lat, a.lng) || a.bairro, regional: regional || a.regional };
}
export const gravarAcao = async (config: GitHubConfig, a: AcaoMapa, remover = false) => {
  const caminho = a.arquivo || caminhoAcoesAno(anoDaAcao(a));
  const r = await gravarNaLista(config, caminho, 'acoes', a, remover, validarAcoes, (remover ? 'Remove ação: ' : 'Ação: ') + a.titulo, semArquivo);
  acoesEmCache = null;
  return r;
};

export const CAMINHO_OBRAS = 'data/obras.json';
export const SITUACOES_OBRA = ['Planejada', 'Em andamento', 'Concluída', 'Suspensa'];
export interface ObraSocial {
  id: string;
  nome: string;
  tipo: 'obra' | 'projeto';
  descricao?: string;
  tema?: string;
  bairros: string[];
  lat?: number;
  lng?: number;
  endereco?: string;
  situacao?: string;
  valor?: number;
  data?: string;
  politicos: string[];
  liderancas: string[];
  fonte?: string;
  teste?: boolean;
}
export function validarObras(bruto: unknown): ObraSocial[] {
  const lista: any[] = Array.isArray((bruto as any)?.obras) ? (bruto as any).obras : [];
  return lista.filter((x) => x && x.nome).map((x) => ({
    id: String(x.id || 'o' + Math.random().toString(36).slice(2)),
    nome: String(x.nome).trim(),
    tipo: x.tipo === 'obra' ? 'obra' : 'projeto',
    descricao: textoOuNada(x.descricao),
    tema: x.tema ? temaDaLista(x.tema) || String(x.tema) : undefined,
    bairros: listaDeTextos(x.bairros),
    lat: numeroOuNada(x.lat),
    lng: numeroOuNada(x.lng),
    endereco: textoOuNada(x.endereco),
    situacao: textoOuNada(x.situacao),
    valor: numeroOuNada(x.valor),
    data: textoOuNada(x.data),
    politicos: listaDeTextos(x.politicos),
    liderancas: listaDeTextos(x.liderancas),
    fonte: textoOuNada(x.fonte),
    teste: Boolean(x.teste)
  }));
}
export const lerObras = async () => validarObras(await fetchDataFile<unknown>(CAMINHO_OBRAS).catch(() => null));
export const gravarObra = (config: GitHubConfig, o: ObraSocial, remover = false) => gravarNaLista(config, CAMINHO_OBRAS, 'obras', o, remover, validarObras, (remover ? 'Remove obra/projeto: ' : 'Obra/projeto: ') + o.nome);

export function bairroDoPonto(areas: any[], lat: number, lng: number): string | undefined {
  const f = areas.find((a) => a?.properties?.nivel !== 'regional' && pontoNaArea(lng, lat, a.geometry));
  return f?.properties?.nome;
}
export function regionalDoPonto(areas: any[], lat: number, lng: number): string | undefined {
  const f = areas.find((a) => a?.properties?.nivel === 'regional' && pontoNaArea(lng, lat, a.geometry));
  return f?.properties?.nome;
}
export function centroDaArea(areas: any[], nome: string): [number, number] | null {
  const f = areas.find((a) => chavePerfil(a?.properties?.nome) === chavePerfil(nome));
  if (!f) return null;
  const polis = f.geometry?.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry?.coordinates || [];
  let sx = 0, sy = 0, n = 0;
  polis.forEach((p: number[][][]) => (p[0] || []).forEach(([x, y]) => { sx += x; sy += y; n++; }));
  return n ? [sy / n, sx / n] : null;
}
export async function geocodificar(endereco: string, municipio = 'Contagem, MG'): Promise<{ lat: number; lng: number } | null> {
  const q = encodeURIComponent(`${endereco}, ${municipio}, Brasil`);
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${q}`, { headers: { Accept: 'application/json' } });
  if (!r.ok) return null;
  const j = await r.json();
  return Array.isArray(j) && j[0] ? { lat: Number(j[0].lat), lng: Number(j[0].lon) } : null;
}

export interface AfinidadeLideranca { pessoa: PessoaParaAlianca; pontos: number; motivos: string[] }
export function afinidadesDaLideranca(l: Lideranca, pessoas: PessoaParaAlianca[], atuacao: Record<string, string[]>, limite = 8): AfinidadeLideranca[] {
  const ligados = new Set(l.vinculos.map((v) => chavePerfil(v.pessoa)));
  const bairrosL = new Set(l.bairros.map(chavePerfil));
  const saida: AfinidadeLideranca[] = [];
  pessoas.forEach((p) => {
    if (ligados.has(p.chave) || Boolean(p.teste) !== Boolean(l.teste)) return;
    let pontos = 0;
    const motivos: string[] = [];
    const comunsB = (atuacao[p.chave] || []).filter((b) => bairrosL.has(chavePerfil(b)));
    if (comunsB.length) { pontos += Math.min(6, comunsB.length * 2); motivos.push('atua nos mesmos bairros: ' + comunsB.slice(0, 3).join(', ')); }
    const comunsT = l.temas.filter((t) => p.temas.includes(t));
    if (comunsT.length) { pontos += Math.min(3, comunsT.length); motivos.push('temas em comum: ' + comunsT.slice(0, 3).join(', ')); }
    if (l.posicao != null && p.posicao != null) {
      const d = Math.abs(l.posicao - p.posicao);
      if (d <= 1) { pontos += 1.5; motivos.push('mesma posição política'); } else if (d >= 6) pontos -= 2;
    }
    if (pontos < 2 || !motivos.length) return;
    saida.push({ pessoa: p, pontos, motivos });
  });
  return saida.sort((a, b) => b.pontos - a.pontos || b.pessoa.votos - a.pessoa.votos).slice(0, limite);
}

export const CAMINHO_LOCAIS_CAMPANHA = 'data/campanha_locais.json';
export const CAMINHO_AGENDA_CAMPANHA = 'data/campanha_agenda.json';
export const TIPOS_LOCAL: Record<string, { nome: string; cor: string }> = {
  feira: { nome: 'Feira', cor: '#ea580c' },
  igreja: { nome: 'Igreja / templo', cor: '#7c3aed' },
  associacao: { nome: 'Associação / local de reunião', cor: '#2563eb' },
  praca: { nome: 'Praça / parque', cor: '#16a34a' },
  comercio: { nome: 'Comércio / centro comercial', cor: '#ca8a04' },
  escola: { nome: 'Escola / creche', cor: '#0891b2' },
  saude: { nome: 'Posto de saúde', cor: '#dc2626' },
  transporte: { nome: 'Ponto de ônibus / estação', cor: '#475569' },
  esporte: { nome: 'Campo / quadra', cor: '#65a30d' },
  evento: { nome: 'Evento / festa', cor: '#db2777' },
  bandeira: { nome: 'Ponto de bandeira fixa', cor: '#b91c1c' },
  outro: { nome: 'Outro', cor: '#64748b' }
};
export const USOS_LOCAL: Record<string, string> = { bandeirar: 'Bandeiraço', panfletar: 'Panfletagem', visitar: 'Visita / conversa', reuniao: 'Reunião', bandeira_fixa: 'Bandeira fixa', carro_som: 'Carro de som' };
export const SITUACOES_BANDEIRA: Record<string, { nome: string; cor: string }> = {
  sugerido: { nome: 'Lugar sugerido', cor: '#94a3b8' },
  negociando: { nome: 'Pedindo autorização', cor: '#f59e0b' },
  autorizado: { nome: 'Autorizado', cor: '#2563eb' },
  instalado: { nome: 'Instalada', cor: '#16a34a' },
  retirado: { nome: 'Retirada', cor: '#64748b' }
};
export const RECORRENCIAS: Record<string, string> = { semanal: 'Toda semana', quinzenal: 'A cada 15 dias', mensal: 'Todo mês', anual: 'Uma época do ano', eventual: 'Sem data fixa' };
export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export interface LocalCampanha {
  id: string;
  nome: string;
  tipo: string;
  endereco?: string;
  lat?: number;
  lng?: number;
  recorrencia?: string;
  dias: number[];
  horario?: string;
  epoca?: string;
  publico?: number;
  usos: string[];
  indicados: string[];
  liderancas: string[];
  bandeira?: string;
  responsavel?: string;
  observacoes?: string;
  teste?: boolean;
}
export function validarLocaisCampanha(bruto: unknown): LocalCampanha[] {
  const lista: any[] = Array.isArray((bruto as any)?.locais) ? (bruto as any).locais : [];
  return lista.filter((x) => x && x.nome).map((x) => ({
    id: String(x.id || 'c' + Math.random().toString(36).slice(2)),
    nome: String(x.nome).trim(),
    tipo: x.tipo in TIPOS_LOCAL ? x.tipo : 'outro',
    endereco: textoOuNada(x.endereco),
    lat: numeroOuNada(x.lat),
    lng: numeroOuNada(x.lng),
    recorrencia: x.recorrencia in RECORRENCIAS ? x.recorrencia : undefined,
    dias: Array.isArray(x.dias) ? x.dias.map(Number).filter((d: number) => d >= 0 && d <= 6) : [],
    horario: textoOuNada(x.horario),
    epoca: textoOuNada(x.epoca),
    publico: numeroOuNada(x.publico),
    usos: listaDeTextos(x.usos).filter((u) => u in USOS_LOCAL),
    indicados: listaDeTextos(x.indicados),
    liderancas: listaDeTextos(x.liderancas),
    bandeira: x.bandeira in SITUACOES_BANDEIRA ? x.bandeira : undefined,
    responsavel: textoOuNada(x.responsavel),
    observacoes: textoOuNada(x.observacoes),
    teste: Boolean(x.teste)
  }));
}
export const lerLocaisCampanha = async () => validarLocaisCampanha(await fetchDataFile<unknown>(CAMINHO_LOCAIS_CAMPANHA).catch(() => null));
export const gravarLocalCampanha = (config: GitHubConfig, l: LocalCampanha, remover = false) => gravarNaLista(config, CAMINHO_LOCAIS_CAMPANHA, 'locais', l, remover, validarLocaisCampanha, (remover ? 'Remove local: ' : 'Local de campanha: ') + l.nome);

export const TIPOS_ATIVIDADE: Record<string, string> = { bandeiraco: 'Bandeiraço', panfletagem: 'Panfletagem', visita: 'Visita', reuniao: 'Reunião', caminhada: 'Caminhada', carreata: 'Carreata', evento: 'Evento', bandeira_fixa: 'Bandeira fixa (instalar ou retirar)', outro: 'Outra' };
export const SITUACOES_ATIVIDADE: Record<string, { nome: string; classe: string }> = {
  planejada: { nome: 'Planejada', classe: 'bg-slate-100 text-slate-700' },
  confirmada: { nome: 'Confirmada', classe: 'bg-blue-100 text-blue-800' },
  realizada: { nome: 'Realizada', classe: 'bg-emerald-100 text-emerald-800' },
  cancelada: { nome: 'Cancelada', classe: 'bg-red-100 text-red-800' }
};
export interface AtividadeCampanha {
  id: string;
  data: string;
  hora?: string;
  tipo: string;
  titulo?: string;
  localId?: string;
  endereco?: string;
  lat?: number;
  lng?: number;
  candidatos: string[];
  liderancas: string[];
  equipe?: string;
  materiais?: string;
  situacao: string;
  resultado?: string;
  teste?: boolean;
}
export function validarAgenda(bruto: unknown): AtividadeCampanha[] {
  const lista: any[] = Array.isArray((bruto as any)?.agenda) ? (bruto as any).agenda : [];
  return lista.filter((x) => x && /^\d{4}-\d{2}-\d{2}$/.test(String(x.data || ''))).map((x) => ({
    id: String(x.id || 'g' + Math.random().toString(36).slice(2)),
    data: String(x.data),
    hora: textoOuNada(x.hora),
    tipo: x.tipo in TIPOS_ATIVIDADE ? x.tipo : 'outro',
    titulo: textoOuNada(x.titulo),
    localId: textoOuNada(x.localId),
    endereco: textoOuNada(x.endereco),
    lat: numeroOuNada(x.lat),
    lng: numeroOuNada(x.lng),
    candidatos: listaDeTextos(x.candidatos),
    liderancas: listaDeTextos(x.liderancas),
    equipe: textoOuNada(x.equipe),
    materiais: textoOuNada(x.materiais),
    situacao: x.situacao in SITUACOES_ATIVIDADE ? x.situacao : 'planejada',
    resultado: textoOuNada(x.resultado),
    teste: Boolean(x.teste)
  }));
}
export const lerAgenda = async () => validarAgenda(await fetchDataFile<unknown>(CAMINHO_AGENDA_CAMPANHA).catch(() => null));
export const gravarAtividade = (config: GitHubConfig, a: AtividadeCampanha, remover = false) => gravarNaLista(config, CAMINHO_AGENDA_CAMPANHA, 'agenda', a, remover, validarAgenda, (remover ? 'Remove atividade: ' : 'Atividade: ') + a.data + ' ' + (a.titulo || a.tipo));


export const CAMINHO_CENSO = 'data/censo2022.json';
export interface UnidadeCenso {
  pop: number;
  hom: number;
  mul: number;
  dom: number;
  dpp: number;
  h: number[];
  m: number[];
  cor: number[];
  alf: number[];
  respMul: number;
  agua: number;
  esgoto: number;
  lixo: number;
  semBanheiro: number;
  area: number;
  regional?: string;
}
export interface Censo {
  fonte: string;
  faixas: string[];
  cores: string[];
  bairros: Record<string, UnidadeCenso>;
  regionais: Record<string, UnidadeCenso>;
  mapaBairros: Record<string, string[]>;
}
let censoEmMemoria: Promise<Censo | null> | null = null;
export function lerCenso(): Promise<Censo | null> {
  if (!censoEmMemoria) censoEmMemoria = fetchDataFile<Censo>(CAMINHO_CENSO).then((c) => (c && c.bairros ? c : null)).catch(() => null);
  return censoEmMemoria;
}
export function somarCenso(us: UnidadeCenso[]): UnidadeCenso | null {
  if (!us.length) return null;
  const s: any = JSON.parse(JSON.stringify(us[0]));
  us.slice(1).forEach((u: any) => Object.keys(s).forEach((k) => {
    if (Array.isArray(s[k])) s[k] = s[k].map((v: number, i: number) => v + (u[k]?.[i] || 0));
    else if (typeof s[k] === 'number') s[k] += Number(u[k]) || 0;
  }));
  return s as UnidadeCenso;
}
export function censoDaArea(censo: Censo | null, nome: string, nivel: 'bairro' | 'regional'): { u: UnidadeCenso; origem: string[] } | null {
  if (!censo || !nome) return null;
  const alvo = chavePerfil(nome);
  if (nivel === 'regional') {
    const k = Object.keys(censo.regionais).find((r) => chavePerfil(r) === alvo);
    return k ? { u: censo.regionais[k], origem: [k] } : null;
  }
  const chave = Object.keys(censo.mapaBairros).find((b) => chavePerfil(b) === alvo);
  const origem = chave ? censo.mapaBairros[chave].filter((b) => censo.bairros[b]) : [];
  const u = somarCenso(origem.map((b) => censo.bairros[b]));
  return u ? { u, origem } : null;
}
export const pop16Mais = (u: UnidadeCenso) => 0.8 * ((u.h[3] || 0) + (u.m[3] || 0)) + u.h.slice(4).reduce((a, b) => a + b, 0) + u.m.slice(4).reduce((a, b) => a + b, 0);
const faixa = (u: UnidadeCenso, de: number, ate: number) => u.h.slice(de, ate + 1).reduce((a, b) => a + b, 0) + u.m.slice(de, ate + 1).reduce((a, b) => a + b, 0);
const razao = (a: number, b: number) => (b > 0 ? a / b : null);
export interface IndicadorCenso { id: string; nome: string; formato: 'pct' | 'num' | 'dec'; valor: (u: UnidadeCenso) => number | null }
export const INDICADORES_CENSO: IndicadorCenso[] = [
  { id: 'pop', nome: 'População', formato: 'num', valor: (u) => u.pop },
  { id: 'pop16', nome: 'Pessoas de 16 anos ou mais (estimativa)', formato: 'num', valor: (u) => pop16Mais(u) },
  { id: 'dens', nome: 'Habitantes por km²', formato: 'num', valor: (u) => razao(u.pop, u.area) },
  { id: 'mulheres', nome: '% de mulheres', formato: 'pct', valor: (u) => razao(u.mul, u.hom + u.mul) },
  { id: 'criancas', nome: '% de 0 a 14 anos', formato: 'pct', valor: (u) => razao(faixa(u, 0, 2), u.hom + u.mul) },
  { id: 'jovens', nome: '% de 15 a 29 anos', formato: 'pct', valor: (u) => razao(faixa(u, 3, 5), u.hom + u.mul) },
  { id: 'adultos', nome: '% de 30 a 59 anos', formato: 'pct', valor: (u) => razao(faixa(u, 6, 8), u.hom + u.mul) },
  { id: 'idosos', nome: '% de 60 anos ou mais', formato: 'pct', valor: (u) => razao(faixa(u, 9, 10), u.hom + u.mul) },
  { id: 'mulheres1659', nome: 'Mulheres de 15 a 59 anos (quantidade)', formato: 'num', valor: (u) => u.m.slice(3, 9).reduce((a, b) => a + b, 0) },
  { id: 'negros', nome: '% de pretos e pardos', formato: 'pct', valor: (u) => razao(u.cor[1] + u.cor[3], u.cor.reduce((a, b) => a + b, 0)) },
  { id: 'alfab', nome: '% que sabe ler e escrever (15 anos ou mais)', formato: 'pct', valor: (u) => razao(u.alf[0], u.alf[0] + u.alf[1]) },
  { id: 'chefMul', nome: '% de domicílios chefiados por mulher', formato: 'pct', valor: (u) => razao(u.respMul, u.dpp) },
  { id: 'morDom', nome: 'Moradores por domicílio', formato: 'dec', valor: (u) => razao(u.pop, u.dom) },
  { id: 'esgoto', nome: '% de domicílios com esgoto em rede', formato: 'pct', valor: (u) => razao(u.esgoto, u.dpp) },
  { id: 'agua', nome: '% de domicílios com água da rede', formato: 'pct', valor: (u) => razao(u.agua, u.dpp) },
  { id: 'lixo', nome: '% de domicílios com coleta de lixo', formato: 'pct', valor: (u) => razao(u.lixo, u.dpp) },
  { id: 'semBanheiro', nome: '% de domicílios sem banheiro próprio', formato: 'pct', valor: (u) => razao(u.semBanheiro, u.dpp) }
];
export function formatarIndicador(v: number | null, formato: IndicadorCenso['formato']): string {
  if (v === null || !Number.isFinite(v)) return '-';
  if (formato === 'pct') return (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  if (formato === 'dec') return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  return Math.round(v).toLocaleString('pt-BR');
}

export const CAMINHO_MATERIAIS_CAMPANHA = 'data/campanha_materiais.json';
export interface EntregaMaterial { id: string; para: string; quantidade: number; data?: string; recebido: boolean; obs?: string }
export interface MaterialCampanha { id: string; nome: string; foto?: string; total?: number; candidatos: string[]; entregas: EntregaMaterial[]; observacoes?: string; teste?: boolean }
export function validarMateriais(bruto: unknown): MaterialCampanha[] {
  const lista: any[] = Array.isArray((bruto as any)?.materiais) ? (bruto as any).materiais : [];
  return lista.filter((x) => x && x.nome).map((x) => ({
    id: String(x.id || 'm' + Math.random().toString(36).slice(2)),
    nome: String(x.nome).trim(),
    foto: /^https?:\/\//i.test(String(x.foto || '')) ? String(x.foto).trim() : undefined,
    total: numeroOuNada(x.total),
    candidatos: listaDeTextos(x.candidatos),
    entregas: (Array.isArray(x.entregas) ? x.entregas : []).filter((e: any) => e && e.para).map((e: any) => ({ id: String(e.id || 'e' + Math.random().toString(36).slice(2)), para: String(e.para).trim(), quantidade: Number(e.quantidade) || 0, data: textoOuNada(e.data), recebido: Boolean(e.recebido), obs: textoOuNada(e.obs) })),
    observacoes: textoOuNada(x.observacoes),
    teste: Boolean(x.teste)
  }));
}
export const lerMateriais = async () => validarMateriais(await fetchDataFile<unknown>(CAMINHO_MATERIAIS_CAMPANHA).catch(() => null));
export const gravarMaterial = (config: GitHubConfig, x: MaterialCampanha, remover = false) => gravarNaLista(config, CAMINHO_MATERIAIS_CAMPANHA, 'materiais', x, remover, validarMateriais, (remover ? 'Remove material: ' : 'Material: ') + x.nome);

export async function gravarVariasAcoes(config: GitHubConfig, novas: AcaoMapa[], aoAvancar?: (feito: number, total: number, ano: string) => void): Promise<void> {
  const porAno = new Map<string, AcaoMapa[]>();
  novas.forEach((a) => { const k = a.arquivo || caminhoAcoesAno(anoDaAcao(a)); if (!porAno.has(k)) porAno.set(k, []); porAno.get(k)!.push(semArquivo(a)); });
  let feito = 0;
  for (const [caminho, lista] of Array.from(porAno.entries())) {
    aoAvancar?.(feito, novas.length, caminho);
    await commitFileToGitHub(
      config,
      { path: 'public/' + caminho, content: '', message: `Importa ${lista.length} ações (${caminho.replace(/^data\/acoes\/|\.json$/g, '')})` },
      {
        contentUpdater: (remoto) => {
          let antigo: any = {};
          try { antigo = remoto ? JSON.parse(remoto) : {}; } catch { antigo = {}; }
          const ids = new Set(lista.map((a) => a.id));
          const atuais = validarAcoes(antigo).filter((a) => !ids.has(a.id)).map(semArquivo);
          const chaves = new Set(atuais.map(chaveDuplicidade));
          const semRepetir = lista.filter((a) => !chaves.has(chaveDuplicidade(a)));
          return JSON.stringify({ ...antigo, atualizacao: new Date().toISOString(), acoes: [...atuais, ...semRepetir] });
        }
      }
    );
    feito += lista.length;
  }
  aoAvancar?.(feito, novas.length, '');
  acoesEmCache = null;
}
export function acoesDoKml(texto: string, politico: string, prefixo: string): AcaoMapa[] {
  const doc = new DOMParser().parseFromString(texto, 'text/xml');
  const saida: AcaoMapa[] = [];
  const folders = Array.from(doc.getElementsByTagName('Folder'));
  const marcas = folders.length ? folders.flatMap((f) => Array.from(f.getElementsByTagName('Placemark')).map((p) => ({ p, cat: f.getElementsByTagName('name')[0]?.textContent?.trim() || '' }))) : Array.from(doc.getElementsByTagName('Placemark')).map((p) => ({ p, cat: '' }));
  marcas.forEach(({ p, cat }, i) => {
    const nome = (p.getElementsByTagName('name')[0]?.textContent || '').trim();
    const desc = (p.getElementsByTagName('description')[0]?.textContent || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const c = (p.getElementsByTagName('coordinates')[0]?.textContent || '').trim().split(/[\s]+/)[0].split(',');
    const lng = Number(c[0]), lat = Number(c[1]);
    if (!nome || !Number.isFinite(lat) || !Number.isFinite(lng) || !lat) return;
    const md = /(\d{2})\/(\d{2})\/(\d{4})/.exec(desc);
    const sig = (/^\s*(IND|OF|REQ|MOC|MOÇ|O)\b/i.exec(nome)?.[1] || '').toUpperCase();
    const tipo = /^Projeto de Lei/i.test(nome) ? 'Projeto de lei' : ({ IND: 'Indicação', OF: 'Ofício', O: 'Ofício', REQ: 'Requerimento', MOC: 'Moção', 'MOÇ': 'Moção' } as Record<string, string>)[sig] || 'Outra';
    const tema = temaDaLista(cat) || TEMAS.find((t) => chavePerfil(nome + ' ' + cat).includes(chavePerfil(t).split(' ')[0])) || 'Outros';
    saida.push({ id: `${prefixo}-${i}`, titulo: nome, tipo, numero: /([\d.]+\/\d{4})/.exec(nome)?.[1], data: md ? `${md[3]}-${md[2]}-${md[1]}` : undefined, descricao: desc.replace(/^\d{2}\/\d{2}\/\d{4}\s*[-–]?\s*/, '') || undefined, categoria: cat || undefined, tema, lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, politicos: [politico], liderancas: [], fonte: 'Importado de KML' });
  });
  return saida;
}
export const LIMITE_FORTE = 1.2;
export const LIMITE_FRACO = 0.8;
export interface AreaComplementar {
  nome: string;
  aptos: number;
  votos: Record<string, number>;
  parte: Record<string, number>;
  indice: Record<string, number | null>;
  fortes: string[];
  classe: 'sem' | 'nenhum' | 'misto' | 'um' | 'varios';
}
export interface ResumoComplementar {
  areas: AreaComplementar[];
  sobreposicao: number | null;
  totais: Record<string, number>;
}
export function calcularComplementaridade(areas: Array<{ nome: string; locais: Array<{ aptos: number; votos: Record<string, number> }> }>, ids: string[]): ResumoComplementar {
  const totais: Record<string, number> = {};
  ids.forEach((id) => { totais[id] = 0; });
  let aptosTotal = 0;
  const brutas = areas.map((a) => {
    const votos: Record<string, number> = {};
    ids.forEach((id) => { votos[id] = 0; });
    let aptos = 0;
    a.locais.forEach((l) => {
      aptos += l.aptos || 0;
      ids.forEach((id) => { votos[id] += l.votos[id] || 0; });
    });
    aptosTotal += aptos;
    ids.forEach((id) => { totais[id] += votos[id]; });
    return { nome: a.nome, aptos, votos, temLocal: a.locais.length > 0 };
  });
  const saida: AreaComplementar[] = brutas.map((b) => {
    const parte: Record<string, number> = {};
    const indice: Record<string, number | null> = {};
    ids.forEach((id) => {
      parte[id] = totais[id] > 0 ? b.votos[id] / totais[id] : 0;
      indice[id] = b.temLocal && b.aptos > 0 && aptosTotal > 0 && totais[id] > 0 ? parte[id] / (b.aptos / aptosTotal) : null;
    });
    if (!b.temLocal || b.aptos <= 0) return { nome: b.nome, aptos: b.aptos, votos: b.votos, parte, indice, fortes: [], classe: 'sem' as const };
    const fortes = ids.filter((id) => (indice[id] ?? 0) >= LIMITE_FORTE);
    const fracos = ids.filter((id) => (indice[id] ?? 0) < LIMITE_FRACO);
    const classe = fortes.length > 1 ? 'varios' : fortes.length === 1 ? 'um' : fracos.length === ids.length ? 'nenhum' : 'misto';
    return { nome: b.nome, aptos: b.aptos, votos: b.votos, parte, indice, fortes, classe };
  });
  let sobreposicao: number | null = null;
  if (ids.length >= 2 && ids.every((id) => totais[id] > 0)) {
    let soma = 0;
    saida.forEach((a) => { soma += Math.min(...ids.map((id) => a.parte[id])); });
    sobreposicao = soma;
  }
  return { areas: saida, sobreposicao, totais };
}
export const ASSUNTOS: Array<[string, RegExp]> = [
  ['Buracos e asfalto', /buraco|tapa.?buraco|asfalt|pavimenta|recapea|cascalh|patrolamento/],
  ['Iluminação pública', /ilumina|lampada|luminaria|poste|reator/],
  ['Poda, capina e árvores', /poda|capina|arvore|rocad|mato alto|lote vago/],
  ['Limpeza e lixo', /limpeza|lixo|entulho|bota.?fora|coleta|varri|cata.?treco/],
  ['Esgoto e drenagem', /esgoto|bueiro|boca de lobo|drenagem|galeria pluvial|alagamento|enchente|corrego/],
  ['Água', /\bagua\b|copasa|vazamento|abastecimento/],
  ['Trânsito e sinalização', /quebra.?molas|redutor de velocidade|lombada|sinaliza|faixa de pedestre|semaforo|placa|transito|estacionamento/],
  ['Transporte coletivo', /onibus|ponto de parada|abrigo|transporte coletivo|itinerario/],
  ['Calçadas e acessibilidade', /calcada|passeio|acessibil|rampa|corrimao/],
  ['Praças, esporte e lazer', /praca|quadra|academia|campo de futebol|parque|playground|lazer/],
  ['Saúde', /saude|ubs|unidade basica|upa|medic|vacina|dentista/],
  ['Educação', /escola|creche|cemei|educa|ensino/],
  ['Animais', /animal|animais|castra|zoonose|cachorro|cao|gato|caes/],
  ['Segurança', /seguranca|policia|guarda municipal|camera|videomonitor/],
  ['Moradia e regularização', /moradia|habitacao|regulariza|escritura|ocupacao/]
];
export const assuntoDoTexto = (texto: string): string | null => {
  const t = String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const a = ASSUNTOS.find(([, re]) => re.test(t));
  return a ? a[0] : null;
};
export const distanciaMetros = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const r = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
};
export interface GrupoDePontos<T> {
  chave: string;
  itens: T[];
  lat: number;
  lng: number;
  raio: number;
}
export function agruparPorProximidade<T extends { lat?: number | null; lng?: number | null }>(itens: T[], chaveDe: (x: T) => string, metros: number, minimo: number): GrupoDePontos<T>[] {
  const porChave = new Map<string, T[]>();
  itens.forEach((x) => {
    if (x.lat == null || x.lng == null) return;
    const k = chaveDe(x);
    if (!porChave.has(k)) porChave.set(k, []);
    porChave.get(k)!.push(x);
  });
  const saida: GrupoDePontos<T>[] = [];
  porChave.forEach((lista, chave) => {
    const pai = lista.map((_, i) => i);
    const raiz = (i: number): number => (pai[i] === i ? i : (pai[i] = raiz(pai[i])));
    for (let i = 0; i < lista.length; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        if (distanciaMetros(lista[i].lat!, lista[i].lng!, lista[j].lat!, lista[j].lng!) <= metros) pai[raiz(i)] = raiz(j);
      }
    }
    const grupos = new Map<number, T[]>();
    lista.forEach((x, i) => {
      const r = raiz(i);
      if (!grupos.has(r)) grupos.set(r, []);
      grupos.get(r)!.push(x);
    });
    grupos.forEach((g) => {
      if (g.length < minimo) return;
      const lat = g.reduce((s, x) => s + x.lat!, 0) / g.length;
      const lng = g.reduce((s, x) => s + x.lng!, 0) / g.length;
      const raio = Math.max(...g.map((x) => distanciaMetros(lat, lng, x.lat!, x.lng!)));
      saida.push({ chave, itens: g, lat, lng, raio });
    });
  });
  return saida.sort((a, b) => b.itens.length - a.itens.length);
}
export const CAMINHO_TERRITORIO = 'data/territorio.json';
export const CAMINHO_SETORES = 'data/setor_bairro.json';
export const CAMINHO_TEMAS = 'data/temas.json';
export const CAMINHO_CONFIG_RELATORIO = 'data/relatorio_config.json';
export interface ColunaTerritorio { id: string; nome: string; tipo: 'pessoas' | 'pct' | 'numero'; origem: 'censo' | 'manual' }
export interface LinhaTerritorio { bairro: string; regional: string; bairrosMapa: string[]; valores: Record<string, number | null> }
export interface Territorio { atualizacao?: string; fonte?: string; colunas: ColunaTerritorio[]; linhas: LinhaTerritorio[] }
export function validarTerritorio(b: any): Territorio {
  const colunas: ColunaTerritorio[] = (Array.isArray(b?.colunas) ? b.colunas : [])
    .filter((c: any) => c && /^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(String(c.id || '')) && String(c.nome || '').trim())
    .map((c: any) => ({ id: String(c.id), nome: String(c.nome).trim(), tipo: ['pessoas', 'pct', 'numero'].includes(c.tipo) ? c.tipo : 'numero', origem: c.origem === 'censo' ? 'censo' : 'manual' }));
  const ids = new Set(colunas.map((c) => c.id));
  const linhas: LinhaTerritorio[] = (Array.isArray(b?.linhas) ? b.linhas : [])
    .filter((l: any) => l && String(l.bairro || '').trim())
    .map((l: any) => {
      const valores: Record<string, number | null> = {};
      ids.forEach((id) => {
        const v = l.valores?.[id];
        valores[id] = v === null || v === undefined || v === '' || !isFinite(Number(v)) ? null : Number(v);
      });
      return { bairro: String(l.bairro).trim(), regional: String(l.regional || ''), bairrosMapa: listaDeTextos(l.bairrosMapa), valores };
    });
  return { atualizacao: b?.atualizacao ? String(b.atualizacao) : undefined, fonte: b?.fonte ? String(b.fonte) : undefined, colunas, linhas };
}
export async function lerTerritorio(): Promise<Territorio> {
  return validarTerritorio(await fetchDataFile<unknown>(CAMINHO_TERRITORIO).catch(() => null));
}
export async function gravarTerritorio(config: GitHubConfig, t: Territorio): Promise<void> {
  const limpo = validarTerritorio(t);
  await commitFileToGitHub(config, { path: 'public/' + CAMINHO_TERRITORIO, content: JSON.stringify({ ...limpo, atualizacao: new Date().toISOString().slice(0, 10) }), message: 'Tabela Território' });
}
export interface SetoresBairro { fonte?: string; metodos: string[]; setores: Record<string, Array<[string, number]>> }
export async function lerSetoresBairro(): Promise<SetoresBairro> {
  const b: any = await fetchDataFile<unknown>(CAMINHO_SETORES).catch(() => null);
  const setores: Record<string, Array<[string, number]>> = {};
  if (b && b.setores && typeof b.setores === 'object') {
    Object.entries(b.setores).forEach(([k, v]) => {
      if (Array.isArray(v)) setores[String(k)] = (v as any[]).filter((x) => Array.isArray(x) && x.length >= 2 && isFinite(Number(x[1]))).map((x) => [String(x[0]), Number(x[1])] as [string, number]);
    });
  }
  return { fonte: b?.fonte ? String(b.fonte) : undefined, metodos: listaDeTextos(b?.metodos), setores };
}
export async function lerTemas(): Promise<string[]> {
  const b: any = await fetchDataFile<unknown>(CAMINHO_TEMAS).catch(() => null);
  const lista = listaDeTextos(b?.temas);
  if (lista.length) TEMAS.splice(0, TEMAS.length, ...lista);
  return TEMAS.slice();
}
export async function gravarTemas(config: GitHubConfig, temas: string[]): Promise<void> {
  const lista = Array.from(new Set(temas.map((t) => t.trim()).filter(Boolean)));
  await commitFileToGitHub(config, { path: 'public/' + CAMINHO_TEMAS, content: JSON.stringify({ atualizacao: new Date().toISOString().slice(0, 10), temas: lista }, null, 1), message: 'Lista de temas' });
  TEMAS.splice(0, TEMAS.length, ...lista);
}
export interface FaixaSeguidores { ate: number | null; nome: string }
export interface ConfigRelatorio {
  faixasSeguidores: FaixaSeguidores[];
  classificacao: { redutoFator: number; redutoEleicoes: number; disputaMin: number; disputaMax: number; adversoMax: number; adversoDistancia: number };
  pesos: { eleitorado: number; afinidade: number; historico: number; abstencao: number; atuacao: number };
  amostraMinima: number;
  semelhantes: { distanciaMax: number; temasComuns: number };
  recorrencia: { metros: number; minimo: number };
}
export const CONFIG_RELATORIO_PADRAO: ConfigRelatorio = {
  faixasSeguidores: [{ ate: 1000, nome: 'Pequeno' }, { ate: 10000, nome: 'Médio' }, { ate: 100000, nome: 'Grande' }, { ate: null, nome: 'Muito grande' }],
  classificacao: { redutoFator: 1.5, redutoEleicoes: 2, disputaMin: 0.8, disputaMax: 1.5, adversoMax: 0.8, adversoDistancia: 2 },
  pesos: { eleitorado: 30, afinidade: 25, historico: 20, abstencao: 10, atuacao: 15 },
  amostraMinima: 5,
  semelhantes: { distanciaMax: 1, temasComuns: 1 },
  recorrencia: { metros: 300, minimo: 3 }
};
export function validarConfigRelatorio(b: any): ConfigRelatorio {
  const p = CONFIG_RELATORIO_PADRAO;
  const n = (v: any, padrao: number, min: number, max: number) => (v !== null && v !== '' && isFinite(Number(v)) && Number(v) >= min && Number(v) <= max ? Number(v) : padrao);
  const bloco = <T extends Record<string, number>>(x: any, padrao: T, min: number, max: number): T => {
    const s: any = {};
    Object.keys(padrao).forEach((k) => { s[k] = n(x?.[k], (padrao as any)[k], min, max); });
    return s;
  };
  const faixas: FaixaSeguidores[] = (Array.isArray(b?.faixasSeguidores) ? b.faixasSeguidores : [])
    .filter((f: any) => f && String(f.nome || '').trim())
    .map((f: any) => ({ ate: f.ate === null || f.ate === undefined || f.ate === '' ? null : n(f.ate, 0, 0, 1e9), nome: String(f.nome).trim() }));
  return {
    faixasSeguidores: faixas.length ? faixas : p.faixasSeguidores,
    classificacao: bloco(b?.classificacao, p.classificacao, 0, 100),
    pesos: bloco(b?.pesos, p.pesos, 0, 100),
    amostraMinima: n(b?.amostraMinima, p.amostraMinima, 1, 1000),
    semelhantes: bloco(b?.semelhantes, p.semelhantes, 0, 10),
    recorrencia: bloco(b?.recorrencia, p.recorrencia, 1, 100000)
  };
}
export async function lerConfigRelatorio(): Promise<ConfigRelatorio> {
  return validarConfigRelatorio(await fetchDataFile<unknown>(CAMINHO_CONFIG_RELATORIO).catch(() => null));
}
export async function gravarConfigRelatorio(config: GitHubConfig, c: ConfigRelatorio): Promise<void> {
  await commitFileToGitHub(config, { path: 'public/' + CAMINHO_CONFIG_RELATORIO, content: JSON.stringify({ atualizacao: new Date().toISOString().slice(0, 10), ...validarConfigRelatorio(c) }, null, 1), message: 'Configuração do relatório' });
}
export function diferencas(antes: unknown, depois: unknown, prefixo = ''): Array<{ campo: string; antes: string; depois: string }> {
  const saida: Array<{ campo: string; antes: string; depois: string }> = [];
  const txt = (v: unknown) => (v === undefined || v === null || v === '' ? '(vazio)' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  const ehObj = (v: unknown) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (ehObj(antes) && ehObj(depois)) {
    const chaves = Array.from(new Set([...Object.keys(antes as any), ...Object.keys(depois as any)]));
    chaves.forEach((k) => saida.push(...diferencas((antes as any)[k], (depois as any)[k], prefixo ? prefixo + ' › ' + k : k)));
    return saida;
  }
  if (JSON.stringify(antes ?? null) !== JSON.stringify(depois ?? null)) saida.push({ campo: prefixo || 'valor', antes: txt(antes), depois: txt(depois) });
  return saida;
}
export const CAMINHO_APOIOS = 'data/apoios.json';
export interface ApoioPolitico {
  id: string;
  apoiado: string;
  apoiadores: string[];
  eleicao: string;
  conversao?: number;
  votosConvertidos?: number;
  obs?: string;
  data?: string;
  teste?: boolean;
}
export function validarApoios(b: unknown): ApoioPolitico[] {
  const lista: any[] = Array.isArray((b as any)?.apoios) ? (b as any).apoios : [];
  return lista
    .filter((x) => x && String(x.apoiado || '').trim() && listaDeTextos(x.apoiadores).length)
    .map((x) => ({
      id: String(x.id || 'ap' + Math.random().toString(36).slice(2)),
      apoiado: String(x.apoiado).trim(),
      apoiadores: listaDeTextos(x.apoiadores),
      eleicao: String(x.eleicao || '').trim(),
      conversao: numeroOuNada(x.conversao),
      votosConvertidos: numeroOuNada(x.votosConvertidos),
      obs: textoOuNada(x.obs),
      data: textoOuNada(x.data),
      teste: x.teste ? true : undefined
    }));
}
export async function lerApoios(): Promise<ApoioPolitico[]> {
  return validarApoios(await fetchDataFile<unknown>(CAMINHO_APOIOS).catch(() => null));
}
export const gravarApoio = (config: GitHubConfig, a: ApoioPolitico, remover = false) => gravarNaLista(config, CAMINHO_APOIOS, 'apoios', a, remover, validarApoios, (remover ? 'Remove apoio: ' : 'Apoio: ') + a.apoiadores.join(', ') + ' a ' + a.apoiado);
export interface MedidaApoio {
  locais: number;
  conversao: number | null;
  r2: number | null;
  votosApoiadores: number;
  votosApoiado: number;
  votosAntes: number | null;
  convertidos: number | null;
  taxaFortes: number | null;
  taxaFracos: number | null;
}
export function medirApoio(locais: Array<{ aptos: number; apoiadores: number; apoiado: number; antes?: number | null }>): MedidaApoio {
  const ok = locais.filter((l) => l.aptos > 0);
  const usarAntes = ok.length > 0 && ok.every((l) => l.antes != null);
  const pts = ok.map((l) => ({ w: l.aptos, x: l.apoiadores / l.aptos, y: (l.apoiado - (usarAntes ? (l.antes as number) : 0)) / l.aptos }));
  const W = pts.reduce((s, p) => s + p.w, 0);
  const votosApoiadores = ok.reduce((s, l) => s + l.apoiadores, 0);
  const votosApoiado = ok.reduce((s, l) => s + l.apoiado, 0);
  const votosAntes = usarAntes ? ok.reduce((s, l) => s + (l.antes as number), 0) : null;
  if (pts.length < 3 || W <= 0) return { locais: pts.length, conversao: null, r2: null, votosApoiadores, votosApoiado, votosAntes, convertidos: null, taxaFortes: null, taxaFracos: null };
  const mx = pts.reduce((s, p) => s + p.w * p.x, 0) / W;
  const my = pts.reduce((s, p) => s + p.w * p.y, 0) / W;
  let sxy = 0, sxx = 0, syy = 0;
  pts.forEach((p) => { sxy += p.w * (p.x - mx) * (p.y - my); sxx += p.w * (p.x - mx) ** 2; syy += p.w * (p.y - my) ** 2; });
  const conversao = sxx > 0 ? sxy / sxx : null;
  const r2 = sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : null;
  const ordenados = ok.slice().sort((a, b) => a.apoiadores / a.aptos - b.apoiadores / b.aptos);
  const meio = Math.floor(ordenados.length / 2);
  const taxa = (g: typeof ok) => { const a = g.reduce((s, l) => s + l.aptos, 0); return a > 0 ? g.reduce((s, l) => s + l.apoiado - (usarAntes ? (l.antes as number) : 0), 0) / a : null; };
  return { locais: pts.length, conversao, r2, votosApoiadores, votosApoiado, votosAntes, convertidos: conversao === null ? null : Math.round(Math.max(0, conversao) * votosApoiadores), taxaFortes: taxa(ordenados.slice(meio)), taxaFracos: taxa(ordenados.slice(0, meio)) };
}
export const COLUNAS_CSV_ACOES: Array<{ nomes: string[]; campo: string; obrigatoria?: boolean; explica: string }> = [
  { nomes: ['titulo', 'assunto', 'ementa'], campo: 'titulo', obrigatoria: true, explica: 'O que foi pedido ou feito. Ex.: Operação tapa-buraco na Rua X.' },
  { nomes: ['tipo'], campo: 'tipo', explica: 'Indicação, requerimento, moção, emenda, visita, evento etc.' },
  { nomes: ['numero', 'n'], campo: 'numero', explica: 'Número da proposição. Ex.: 1234/2025. Se o Excel transformar em "jan/25", o app corrige para 1/2025.' },
  { nomes: ['data'], campo: 'data', explica: 'Data no formato 31/12/2025 ou 2025-12-31.' },
  { nomes: ['temas', 'tema'], campo: 'temas', explica: 'Um ou mais temas, separados por vírgula ou ponto e vírgula (use aspas se a coluna tiver vírgula e o arquivo for separado por vírgula). Se faltar, o app tenta deduzir pelo título.' },
  { nomes: ['descricao', 'detalhe', 'texto'], campo: 'descricao', explica: 'Texto mais longo, se houver (por exemplo, a ementa completa).' },
  { nomes: ['bairro'], campo: 'bairro', explica: 'Nome do bairro. Sem latitude e longitude, o ponto vai para o centro do bairro e a ação conta para ele.' },
  { nomes: ['endereco', 'local'], campo: 'endereco', explica: 'Endereço por escrito (fica anotado).' },
  { nomes: ['latitude', 'lat'], campo: 'lat', explica: 'Opcional. Latitude com ponto ou vírgula decimal. Ex.: -19,9321.' },
  { nomes: ['longitude', 'lng', 'lon'], campo: 'lng', explica: 'Opcional. Longitude. Ex.: -44,0539.' },
  { nomes: ['politico', 'vereador', 'autor'], campo: 'politico', explica: 'Quem pediu. Se vier preenchido, vale mais que o nome escolhido na importação. Maiúsculas e acentos não importam.' },
  { nomes: ['orgao', 'destinatario'], campo: 'orgao', explica: 'Órgão ou secretaria para quem foi o pedido.' },
  { nomes: ['link', 'sapl', 'url'], campo: 'link', explica: 'Link da proposição no SAPL (página da matéria). Também serve para não repetir: a mesma matéria enviada de novo não é duplicada.' },
  { nomes: ['pdf', 'link_pdf', 'arquivo'], campo: 'pdf', explica: 'Link direto do PDF da proposição.' },
  { nomes: ['fonte'], campo: 'fonte', explica: 'Origem da informação, se não for o SAPL.' }
];
const lerLinhasCsv = (texto: string): string[][] => {
  const limpo = texto.replace(/^﻿/, '');
  const primeira = limpo.split(/\r?\n/)[0] || '';
  const sep = (primeira.match(/;/g) || []).length > (primeira.match(/,/g) || []).length ? ';' : primeira.includes('\t') && !primeira.includes(',') ? '\t' : ',';
  const linhas: string[][] = [];
  let campo = '', linha: string[] = [], aspas = false;
  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];
    if (aspas) {
      if (c === '"' && limpo[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpo[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      if (linha.some((x) => x.trim())) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some((x) => x.trim())) linhas.push(linha);
  return linhas;
};
const normCsv = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const semPrefixo = (s: string) => normCsv(s).replace(/\b(bairro|jardim|jd|vila|vl|parque|pq|conjunto|conj|residencial|res|nucleo|chacaras?|sitio|recanto)\b/g, ' ').replace(/\b(1a|2a|3a|4a|i|ii|iii|iv|primeira|segunda|terceira|quarta)\b/g, (m) => ({ '1a': '1', '2a': '2', '3a': '3', '4a': '4', i: '1', ii: '2', iii: '3', iv: '4', primeira: '1', segunda: '2', terceira: '3', quarta: '4' } as Record<string, string>)[m] || m).replace(/\b(secao|sec)\b/g, '').replace(/\s+/g, ' ').trim();
export function casarBairro(nome: string, areas: any[], apelidos: Record<string, string> = {}): string | null {
  const alvo = normCsv(nome);
  if (!alvo) return null;
  const bairros = (areas || []).filter((f: any) => f?.properties?.nivel !== 'regional').map((f: any) => String(f.properties.nome));
  const exato = bairros.find((b) => normCsv(b) === alvo);
  if (exato) return exato;
  const junto = bairros.find((b) => normCsv(b).replace(/ /g, '') === alvo.replace(/ /g, ''));
  if (junto) return junto;
  const ap = apelidos[alvo] || Object.entries(apelidos).find(([k]) => k.replace(/ /g, '') === alvo.replace(/ /g, ''))?.[1];
  if (ap && bairros.includes(ap)) return ap;
  const sp = semPrefixo(nome);
  const porRaiz = bairros.filter((b) => semPrefixo(b) === sp);
  if (porRaiz.length === 1) return porRaiz[0];
  const contem = bairros.filter((b) => { const x = semPrefixo(b); return sp.length >= 4 && x.length >= 4 && (x.startsWith(sp + ' ') || sp.startsWith(x + ' ')); });
  if (contem.length === 1) return contem[0];
  if (contem.length > 1) return contem.slice().sort((a, b) => a.length - b.length)[0];
  return null;
}
export function casarRegional(nome: string, areas: any[]): string | null {
  const alvo = normCsv(nome).replace(/^regional /, '');
  const f = (areas || []).find((a: any) => a?.properties?.nivel === 'regional' && normCsv(a.properties.nome).replace(/^regional /, '') === alvo);
  return f ? String(f.properties.nome) : null;
}
const TEMA_DO_ASSUNTO: Record<string, string> = { 'Buracos e asfalto': 'Asfalto e vias', 'Iluminação pública': 'Iluminação pública', 'Poda, capina e árvores': 'Meio ambiente', 'Limpeza e lixo': 'Limpeza urbana e lixo', 'Esgoto e drenagem': 'Saneamento e esgoto', 'Água': 'Água e abastecimento', 'Trânsito e sinalização': 'Transporte e mobilidade', 'Transporte coletivo': 'Transporte e mobilidade', 'Calçadas e acessibilidade': 'Transporte e mobilidade', 'Praças, esporte e lazer': 'Esporte e lazer', 'Saúde': 'Saúde', 'Educação': 'Educação', 'Animais': 'Causa animal', 'Segurança': 'Segurança pública', 'Moradia e regularização': 'Habitação' };
export const temaDoTexto = (texto: string): string | undefined => { const a = assuntoDoTexto(texto); return a ? TEMA_DO_ASSUNTO[a] : undefined; };
const MESES_CSV: Record<string, string> = { jan: '1', fev: '2', mar: '3', abr: '4', mai: '5', jun: '6', jul: '7', ago: '8', set: '9', out: '10', nov: '11', dez: '12' };
const corrigirNumero = (s: string) => {
  const m = s.trim().toLowerCase().match(/^([a-z]{3})\/(\d{2,4})$/);
  if (m && MESES_CSV[m[1]]) return MESES_CSV[m[1]] + '/' + (m[2].length === 2 ? '20' + m[2] : m[2]);
  return s.trim();
};
export function chaveDuplicidade(a: AcaoMapa): string {
  if (a.link) return 'l:' + a.link.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (a.tipo && a.numero) return 'n:' + normCsv(a.tipo) + '|' + normCsv(a.numero) + '|' + (a.data || '').slice(0, 4) + '|' + normCsv(a.politicos[0] || '');
  return 't:' + normCsv(a.titulo) + '|' + (a.data || '') + '|' + normCsv(a.politicos[0] || '');
}
const hashTexto = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
export interface ResultadoCsvAcoes { acoes: AcaoMapa[]; reconhecidas: string[]; ignoradas: string[]; semTitulo: number; semLugar: number; repetidasNoArquivo: number; bairrosNaoAchados: Array<[string, number]>; noCentroDoBairro: number }
export function acoesDoCsv(texto: string, politico: string, prefixo: string, areas: any[], nomesPessoas: string[] = [], apelidos: Record<string, string> = {}): ResultadoCsvAcoes {
  const linhas = lerLinhasCsv(texto);
  const cab = (linhas[0] || []).map(normCsv);
  const pos: Record<string, number> = {};
  const reconhecidas: string[] = [];
  const ignoradas: string[] = [];
  cab.forEach((h, i) => {
    const col = COLUNAS_CSV_ACOES.find((c) => c.nomes.some((n) => normCsv(n) === h));
    if (col && pos[col.campo] === undefined) { pos[col.campo] = i; reconhecidas.push((linhas[0] || [])[i]); }
    else ignoradas.push((linhas[0] || [])[i]);
  });
  const val = (l: string[], campo: string) => (pos[campo] === undefined ? '' : String(l[pos[campo]] || '').trim());
  const num = (s: string) => { const n = Number(s.replace(/\s/g, '').replace(',', '.')); return s && isFinite(n) ? n : undefined; };
  const data = (s: string) => { const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : undefined; };
  const pessoaDe = (s: string) => { const k = normCsv(s); return nomesPessoas.find((n) => normCsv(n) === k) || s.split(/\s+/).map((w) => (w.length > 2 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join(' '); };
  const cacheBairro = new Map<string, string | null>();
  const naoAchados = new Map<string, number>();
  let semTitulo = 0, semLugar = 0, repetidas = 0, noCentro = 0;
  const vistos = new Set<string>();
  const acoes: AcaoMapa[] = [];
  linhas.slice(1).forEach((l) => {
    const titulo = val(l, 'titulo');
    if (!titulo) { semTitulo++; return; }
    let lat = num(val(l, 'lat')), lng = num(val(l, 'lng'));
    let aproximado = false;
    const bairroTxt = val(l, 'bairro');
    let bairroMapa: string | null = null;
    if (bairroTxt) {
      if (!cacheBairro.has(bairroTxt)) cacheBairro.set(bairroTxt, casarBairro(bairroTxt, areas, apelidos));
      bairroMapa = cacheBairro.get(bairroTxt) || null;
    }
    const regionalMapa = bairroTxt && !bairroMapa ? casarRegional(bairroTxt, areas) : null;
    if (bairroTxt && !bairroMapa && !regionalMapa) naoAchados.set(bairroTxt, (naoAchados.get(bairroTxt) || 0) + 1);
    if ((lat === undefined || lng === undefined) && (bairroMapa || regionalMapa)) {
      const c = centroDaArea(areas, (bairroMapa || regionalMapa)!);
      if (c) { lat = c[0]; lng = c[1]; aproximado = true; noCentro++; }
    }
    if (lat === undefined || lng === undefined || Math.abs(lat) > 90 || Math.abs(lng) > 180) { lat = undefined; lng = undefined; semLugar++; }
    const temasTxt = val(l, 'temas').split(/[;,]/).map((t) => t.trim()).filter(Boolean);
    const temas = Array.from(new Set(temasTxt.map((t) => temaDaLista(t) || t)));
    const tema = temas[0] || temaDoTexto(titulo + ' ' + val(l, 'descricao')) || undefined;
    const quem = val(l, 'politico') ? pessoaDe(val(l, 'politico')) : politico;
    const link = val(l, 'link') || undefined;
    const dt = data(val(l, 'data'));
    const a: AcaoMapa = {
      id: '',
      titulo,
      tipo: val(l, 'tipo') || undefined,
      numero: val(l, 'numero') ? corrigirNumero(val(l, 'numero')) : undefined,
      data: dt,
      descricao: val(l, 'descricao') || undefined,
      tema,
      temas: temas.length ? temas : undefined,
      lat,
      lng,
      aproximado: aproximado || undefined,
      bairro: bairroMapa || bairroTxt || undefined,
      endereco: val(l, 'endereco') || undefined,
      orgao: val(l, 'orgao') || undefined,
      politicos: quem ? [quem] : [],
      liderancas: [],
      link,
      pdf: val(l, 'pdf') || undefined,
      fonte: val(l, 'fonte') || (link && /sapl/i.test(link) ? 'SAPL' : 'Importado de CSV')
    };
    const chave = chaveDuplicidade(a);
    if (vistos.has(chave)) { repetidas++; return; }
    vistos.add(chave);
    const materia = link ? link.match(/materia\/(\d+)/) : null;
    a.id = materia ? 'sapl-' + materia[1] : prefixo + '-' + hashTexto(chave);
    acoes.push(a);
  });
  return { acoes, reconhecidas, ignoradas, semTitulo, semLugar, repetidasNoArquivo: repetidas, bairrosNaoAchados: Array.from(naoAchados.entries()).sort((x, y) => y[1] - x[1]), noCentroDoBairro: noCentro };
}
const TABELA_CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (d: Uint8Array) => { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = TABELA_CRC[(c ^ d[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function zipSimples(arquivos: Array<{ nome: string; dados: Uint8Array }>): Blob {
  const partes: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let pos = 0;
  const enc = new TextEncoder();
  arquivos.forEach((a) => {
    const nome = enc.encode(a.nome);
    const crc = crc32(a.dados);
    const cab = new DataView(new ArrayBuffer(30));
    cab.setUint32(0, 0x04034b50, true); cab.setUint16(4, 20, true); cab.setUint16(6, 0x0800, true); cab.setUint16(8, 0, true);
    cab.setUint32(14, crc, true); cab.setUint32(18, a.dados.length, true); cab.setUint32(22, a.dados.length, true); cab.setUint16(26, nome.length, true);
    partes.push(cab.buffer, nome, a.dados);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, a.dados.length, true); cen.setUint32(24, a.dados.length, true); cen.setUint16(28, nome.length, true); cen.setUint32(42, pos, true);
    const c = new Uint8Array(46 + nome.length); c.set(new Uint8Array(cen.buffer), 0); c.set(nome, 46);
    central.push(c);
    pos += 30 + nome.length + a.dados.length;
  });
  const tam = central.reduce((s, c) => s + c.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true); fim.setUint16(8, arquivos.length, true); fim.setUint16(10, arquivos.length, true); fim.setUint32(12, tam, true); fim.setUint32(16, pos, true);
  return new Blob([...partes, ...central, fim.buffer], { type: 'application/zip' });
}
export const nomeArquivoFoto = (pessoa: string) => chavePerfil(pessoa).replace(/ /g, '-') + '.jpg';
let fotosPropriasEmCache: Promise<Set<string>> | null = null;
export function lerFotosProprias(): Promise<Set<string>> {
  if (!fotosPropriasEmCache) fotosPropriasEmCache = fetch('/fotos/indice.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((j: any) => new Set<string>(Array.isArray(j?.arquivos) ? j.arquivos.map(String) : [])).catch(() => new Set<string>());
  return fotosPropriasEmCache;
}