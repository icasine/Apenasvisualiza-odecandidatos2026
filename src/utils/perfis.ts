import { fetchDataFile } from './dataLoader';

export const CAMINHO_PERFIS = 'data/perfis.json';



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

const listaDeTextos = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);













export const CAMINHO_TEMAS = 'data/temas.json';
export const CAMINHO_CONFIG_RELATORIO = 'data/relatorio_config.json';
export async function lerTemas(): Promise<string[]> {
  const b: any = await fetchDataFile<unknown>(CAMINHO_TEMAS).catch(() => null);
  const lista = listaDeTextos(b?.temas);
  if (lista.length) TEMAS.splice(0, TEMAS.length, ...lista);
  return TEMAS.slice();
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
export const nomeArquivoFoto = (pessoa: string) => chavePerfil(pessoa).replace(/ /g, '-') + '.jpg';
let fotosPropriasEmCache: Promise<Set<string>> | null = null;
export function lerFotosProprias(): Promise<Set<string>> {
  if (!fotosPropriasEmCache) fotosPropriasEmCache = fetch('/fotos/indice.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((j: any) => new Set<string>(Array.isArray(j?.arquivos) ? j.arquivos.map(String) : [])).catch(() => new Set<string>());
  return fotosPropriasEmCache;
}

export const hojeIso = (): string => {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export interface Federacao { nome: string; partidos: string[]; anos: string[] }
export const FEDERACOES_PADRAO: Federacao[] = [
  { nome: 'Federação Brasil da Esperança', partidos: ['PT', 'PC DO B', 'PV'], anos: ['2022', '2024', '2026'] },
  { nome: 'Federação PSDB Cidadania', partidos: ['PSDB', 'CIDADANIA'], anos: ['2022', '2024', '2026'] },
  { nome: 'Federação PSOL REDE', partidos: ['PSOL', 'REDE'], anos: ['2022', '2024', '2026'] },
  { nome: 'Federação Renovação Solidária', partidos: ['PRD', 'SOLIDARIEDADE'], anos: ['2026'] },
  { nome: 'Federação União Progressista', partidos: ['UNIÃO', 'PP'], anos: ['2026'] }
];
const APELIDOS_DE_PARTIDO: Record<string, string> = { uniaobrasil: 'uniao', progressistas: 'pp', redesustentabilidade: 'rede', partidodostrabalhadores: 'pt', partidoverde: 'pv', partidocomunistadobrasil: 'pcdob' };
export const chavePartido = (s: string | undefined | null): string => {
  const k = chavePerfil(String(s || '')).replace(/\s+/g, '');
  return APELIDOS_DE_PARTIDO[k] || k;
};
export const federacaoDoPartido = (feds: Federacao[], partido: string | undefined | null, ano: string | number): Federacao | null => {
  const k = chavePartido(partido);
  if (!k) return null;
  return feds.find((f) => f.anos.includes(String(ano)) && f.partidos.some((x) => chavePartido(x) === k)) || null;
};
export function validarFederacoes(b: any): Federacao[] {
  return (Array.isArray(b) ? b : [])
    .map((f: any) => ({
      nome: String(f?.nome || '').trim(),
      partidos: (Array.isArray(f?.partidos) ? f.partidos : []).map((x: any) => String(x || '').trim().toUpperCase()).filter(Boolean),
      anos: Array.from(new Set((Array.isArray(f?.anos) ? f.anos : []).map((x: any) => String(x || '').trim()).filter((x: string) => /^\d{4}$/.test(x)))).sort() as string[]
    }))
    .filter((f: Federacao) => f.nome && f.partidos.length >= 2);
}

export async function lerFederacoes(): Promise<Federacao[]> {
  const bruto = await fetchDataFile<any>(CAMINHO_CONFIG_RELATORIO).catch(() => null);
  const lista = validarFederacoes(bruto && bruto.federacoes);
  return lista.length ? lista : FEDERACOES_PADRAO;
}