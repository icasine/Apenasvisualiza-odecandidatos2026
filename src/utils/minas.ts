
import { CargoId } from '../types/election';
import { fetchDataFile } from './dataLoader';
import { guardarAvulsoNoAparelho, lerAvulsoDoAparelho } from './copiaLocal';

export const CAMINHO_INDICE_MINAS = 'data/mg/indice.json';
export const CAMINHO_MALHA_MINAS = 'data/mg/malha.json';

export interface MunicipioMG {
  cod: string;
  nome: string;
  chave: string;
  geo: { type: 'Polygon' | 'MultiPolygon'; coordinates: any };
  centro: [number, number];
}

export interface MinasItemInfo {
  id: string;
  ano: string;
  cargo: CargoId;
  numero: string;
  nome: string;
  partido?: string;
  arquivo: string;
  totalVotos: number;
  totalMunicipios: number;
  cor: string;
  enviadoEm: string;
  nomeArquivo?: string;
  situacao?: string;
  temPercentual?: boolean;
}

export interface MinasIndice {
  atualizacao: string | null;
  itens: MinasItemInfo[];
}

export interface MinasArquivo {
  id: string;
  ano: string;
  cargo: CargoId;
  numero: string;
  nome: string;
  partido?: string;
  totalVotos: number;
  municipios: Array<[string, number] | [string, number, number]>;
  semCorrespondencia: Array<{ nome: string; votos: number }>;
  enviadoEm: string;
  nomeArquivo: string;
  situacao?: string;
  totalInformado?: number;
}

export interface MalhaSalva {
  fonte: string;
  baixadaEm: string;
  municipios: Array<{ c: string; n: string; t: 'Polygon' | 'MultiPolygon'; g: any }>;
}

export const CORES_MINAS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

export const RAMPA_AZUL = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#1c5cab', '#0d366b'];
export const COR_SEM_VOTO = '#f0efec';

const APELIDOS_MUNICIPIOS: Record<string, string> = {
  'BRASOPOLIS': 'BRAZOPOLIS',
  'DONA EUSEBIA': 'DONA EUZEBIA',
  'SAO THOME DAS LETRAS': 'SAO TOME DAS LETRAS',
  'QUELUZITA': 'QUELUZITO',
  'ITABIRINHA DE MANTENA': 'ITABIRINHA',
  'GOUVEA': 'GOUVEIA',
  'BARAO DO MONTE ALTO': 'BARAO DE MONTE ALTO',
  'AMPARO DA SERRA': 'AMPARO DO SERRA',
  'SANTA RITA DO IBITIPOCA': 'SANTA RITA DE IBITIPOCA',
  'MATIAS LOBATO': 'MATHIAS LOBATO',
  'SAO JOAO DEL REY': 'SAO JOAO DEL REI'
};

export function chaveMunicipio(nome: string): string {
  const base = String(nome || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return APELIDOS_MUNICIPIOS[base] || base;
}

function centroDaGeometria(geo: MunicipioMG['geo']): [number, number] {
  const aneis: number[][][] = geo.type === 'Polygon' ? [geo.coordinates[0]] : geo.coordinates.map((p: any) => p[0]);
  let maior: number[][] = aneis[0] || [];
  aneis.forEach((a) => {
    if (a.length > maior.length) maior = a;
  });
  if (maior.length === 0) return [-18.5, -44.5];
  let somaLon = 0;
  let somaLat = 0;
  maior.forEach((p) => {
    somaLon += p[0];
    somaLat += p[1];
  });
  return [somaLat / maior.length, somaLon / maior.length];
}

function montarMunicipio(cod: string, nome: string, tipo: 'Polygon' | 'MultiPolygon', coordenadas: any): MunicipioMG {
  const geo = { type: tipo, coordinates: coordenadas };
  return { cod: String(cod), nome, chave: chaveMunicipio(nome), geo, centro: centroDaGeometria(geo) };
}

export async function baixarMalhaDoIBGE(): Promise<MalhaSalva> {
  const base = 'https://servicodados.ibge.gov.br/api';
  const [resMalha, resNomes] = await Promise.all([
    fetch(`${base}/v3/malhas/estados/31?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio`),
    fetch(`${base}/v1/localidades/estados/31/municipios`)
  ]);
  if (!resMalha.ok || !resNomes.ok) {
    throw new Error('O serviço de mapas do IBGE não respondeu. Tente de novo em alguns minutos.');
  }
  const malha = await resMalha.json();
  const nomes: Array<{ id: number; nome: string }> = await resNomes.json();
  const nomePorCodigo = new Map<string, string>();
  nomes.forEach((n) => nomePorCodigo.set(String(n.id), n.nome));

  const municipios = (malha.features || [])
    .filter((f: any) => f && f.geometry && f.properties && f.properties.codarea)
    .map((f: any) => ({
      c: String(f.properties.codarea),
      n: nomePorCodigo.get(String(f.properties.codarea)) || String(f.properties.codarea),
      t: f.geometry.type as 'Polygon' | 'MultiPolygon',
      g: f.geometry.coordinates
    }));

  if (municipios.length < 800) {
    throw new Error('A malha recebida do IBGE veio incompleta.');
  }
  return { fonte: 'IBGE, malha municipal de Minas Gerais (qualidade mínima)', baixadaEm: new Date().toISOString(), municipios };
}

let malhaEmAndamento: Promise<MunicipioMG[]> | null = null;
const CHAVE_MALHA_NO_APARELHO = 'malha_mg_ibge';

export function carregarMalhaMG(opcoes: { silencioso?: boolean } = {}): Promise<MunicipioMG[]> {
  if (!malhaEmAndamento) {
    malhaEmAndamento = (async () => {
      const valida = (m: MalhaSalva | null): m is MalhaSalva => Boolean(m && Array.isArray(m.municipios) && m.municipios.length >= 800);
      let salva: MalhaSalva | null = null;
      try {
        salva = await fetchDataFile<MalhaSalva>(CAMINHO_MALHA_MINAS, opcoes);
      } catch {
        salva = null;
      }
      if (!valida(salva)) {
        try {
          const guardada = await lerAvulsoDoAparelho(CHAVE_MALHA_NO_APARELHO);
          salva = guardada ? (JSON.parse(guardada) as MalhaSalva) : null;
        } catch {
          salva = null;
        }
        if (!valida(salva)) {
          salva = await baixarMalhaDoIBGE();
          void guardarAvulsoNoAparelho(CHAVE_MALHA_NO_APARELHO, JSON.stringify(salva));
        }
      }
      return salva.municipios
        .map((m) => montarMunicipio(m.c, m.n, m.t, m.g))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    })().catch((e) => {
      malhaEmAndamento = null;
      throw e;
    });
  }
  return malhaEmAndamento;
}

export function preCarregarMinas(): void {
  carregarIndiceMinas({ silencioso: true })
    .then((indice) => {
      indice.itens.slice(0, 8).forEach((item) => void fetchDataFile(item.arquivo, { silencioso: true }).catch(() => null));
    })
    .catch(() => {});
  void carregarMalhaMG({ silencioso: true }).catch(() => {});
}

export async function carregarIndiceMinas(opcoes: { silencioso?: boolean } = {}): Promise<MinasIndice> {
  const dados = await fetchDataFile<MinasIndice>(CAMINHO_INDICE_MINAS, opcoes);
  if (dados && Array.isArray(dados.itens)) return dados;
  return { atualizacao: null, itens: [] };
}

export function limitesParaPercentual(valores: number[]): number[] {
  const maior = valores.reduce((m, v) => (v > m ? v : m), 0);
  const fixos = [1, 5, 10, 20, 30].filter((c) => c < maior);
  return fixos.length >= 2 ? fixos : limitesPorQuantisDecimais(valores);
}

export function limitesPorQuantisDecimais(valores: number[], classes: number = RAMPA_AZUL.length): number[] {
  const positivos = valores.filter((v) => v > 0).sort((a, b) => a - b);
  if (positivos.length === 0) return [];
  const limites: number[] = [];
  for (let k = 1; k < classes; k++) {
    const pos = Math.floor((k * positivos.length) / classes);
    const v = Math.round(positivos[Math.min(positivos.length - 1, pos)] * 100) / 100;
    if (v > positivos[0] && (limites.length === 0 || v > limites[limites.length - 1])) limites.push(v);
  }
  return limites;
}

export function limitesPorQuantis(valores: number[], classes: number = RAMPA_AZUL.length): number[] {
  const positivos = valores.filter((v) => v > 0).sort((a, b) => a - b);
  if (positivos.length === 0) return [];
  const min = Math.max(1, positivos[0]);
  const max = positivos[positivos.length - 1];
  if (max <= min) return [];
  const bonito = (v: number) => {
    if (v < 10) return Math.round(v);
    const passo = Math.pow(10, Math.floor(Math.log10(v)) - 1);
    return Math.round(v / passo) * passo;
  };
  const lmin = Math.log10(min);
  const lmax = Math.log10(max);
  const limites: number[] = [];
  for (let k = 1; k < classes; k++) {
    const v = bonito(Math.pow(10, lmin + ((lmax - lmin) * k) / classes));
    if (v > min && (limites.length === 0 || v > limites[limites.length - 1])) limites.push(v);
  }
  return limites;
}

export function corPorValor(valor: number, limites: number[], rampa: string[] = RAMPA_AZUL): string {
  if (!(valor > 0)) return COR_SEM_VOTO;
  let classe = 0;
  while (classe < limites.length && valor >= limites[classe]) classe++;
  const totalClasses = limites.length + 1;
  const indice = totalClasses <= 1 ? rampa.length - 2 : Math.round((classe * (rampa.length - 1)) / (totalClasses - 1));
  return rampa[Math.max(0, Math.min(rampa.length - 1, indice))];
}

export function rampaDaCor(cor: string): string[] {
  const m = /^#([0-9a-fA-F]{6})$/.exec(cor);
  if (!m) return RAMPA_AZUL;
  const base = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  const misturar = (alvo: number, t: number) =>
    '#' + base.map((c) => Math.round(c + (alvo - c) * t).toString(16).padStart(2, '0')).join('');
  return [misturar(255, 0.78), misturar(255, 0.56), misturar(255, 0.32), misturar(255, 0.06), misturar(0, 0.28), misturar(0, 0.55)];
}

export function escaparHtml(valor: unknown): string {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function corValida(cor: unknown, reserva: string = CORES_MINAS[0]): string {
  return typeof cor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(cor) ? cor : reserva;
}
