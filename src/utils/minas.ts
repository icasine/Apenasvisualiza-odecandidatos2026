
import { CargoId } from '../types/election';
import { fetchDataFile } from './dataLoader';
import { guardarAvulsoNoAparelho, lerAvulsoDoAparelho } from './copiaLocal';
import { extrairLinhasDeArquivo, normalizarChave } from './csvParser';

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

export async function lerTabelaDeArquivo(file: File): Promise<string[][]> {
  const nome = file.name.toLowerCase();
  if (nome.endsWith('.xlsx') || nome.endsWith('.xls')) {
    return extrairLinhasDeArquivo(file);
  }
  const bytes = await file.arrayBuffer();
  let texto: string;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    texto = new TextDecoder('windows-1252').decode(bytes);
  }
  const corrigido = new File([texto], file.name, { type: 'text/csv' });
  return extrairLinhasDeArquivo(corrigido);
}

export function numeroDeVotos(valor: unknown): number | null {
  const s = String(valor ?? '').trim();
  if (!s) return null;
  const limpo = s.replace(/[^\d-]/g, '');
  if (!limpo || limpo === '-') return null;
  const n = parseInt(limpo, 10);
  return Number.isFinite(n) ? n : null;
}

export interface ColunasMinas {
  municipio: number;
  uf: number;
  formatoLongo: boolean;
  numeroCandidato: number;
  nomeCandidato: number;
  votosLongo: number;
  cargoLongo: number;
  anoLongo: number;
  partidoLongo: number;
  numericas: number[];
  codigoIbge: number;
  percentuais: number[];
  totalizadas: number;
  observacao: number;
}

const achar = (chaves: string[], opcoes: string[]): number => {
  for (const o of opcoes) {
    const i = chaves.indexOf(o);
    if (i >= 0) return i;
  }
  return -1;
};

export function detectarColunasMinas(linhas: string[][]): ColunasMinas {
  const cabecalho = linhas[0] || [];
  const chaves = cabecalho.map((h) => normalizarChave(h));
  const municipio = achar(chaves, ['nm_municipio', 'municipio', 'nome_municipio', 'nome_do_municipio', 'cidade', 'nm_ue', 'localidade']);
  const uf = achar(chaves, ['sg_uf', 'uf', 'estado']);
  const numeroCandidato = achar(chaves, ['nr_candidato', 'nr_votavel', 'numero_candidato', 'numero_do_candidato']);
  const votosLongo = achar(chaves, ['qt_votos_nominais', 'qt_votos_nominais_validos', 'qt_votos', 'votos_nominais']);
  const nomeCandidato = achar(chaves, ['nm_urna_candidato', 'nm_votavel', 'nm_candidato', 'nome_candidato']);
  const cargoLongo = achar(chaves, ['ds_cargo', 'cargo']);
  const anoLongo = achar(chaves, ['ano_eleicao', 'aa_eleicao', 'ano']);
  const partidoLongo = achar(chaves, ['sg_partido', 'partido']);
  const formatoLongo = numeroCandidato >= 0 && votosLongo >= 0;
  const amostraInicial = linhas.slice(1, 60);

  let codigoIbge = chaves.findIndex((c) => /(^|_)ibge(_|$)/.test(c));
  if (codigoIbge < 0) {
    codigoIbge = chaves.findIndex((c, i) => {
      if (!/(^|_)(cod|cd|codigo)(_|$)/.test(c)) return false;
      const valores = amostraInicial.map((l) => String(l[i] ?? '').trim()).filter(Boolean);
      return valores.length > 0 && valores.every((v) => /^31\d{5}$/.test(v));
    });
  }
  const totalizadas = chaves.findIndex((c) => c.includes('totalizad'));
  const observacao = chaves.findIndex((c) => c.startsWith('observac') || c === 'obs');
  const percentuais: number[] = [];
  chaves.forEach((c, i) => {
    if (i !== totalizadas && /(^|_)(pct|perc|percentual|porcentagem)(_|$)/.test(c)) percentuais.push(i);
  });

  const reservadas = new Set([municipio, uf, numeroCandidato, votosLongo, nomeCandidato, cargoLongo, anoLongo, partidoLongo, codigoIbge, totalizadas, observacao, ...percentuais]);
  const ignorarPorNome = /^(cd_|nr_|sq_|dt_|hh_|ano|codigo|cod_|id$|zona|turno)|(^|_)(cod|cd|codigo|tse|ibge|pct|perc|percentual)(_|$)/;
  const numericas: number[] = [];
  if (!formatoLongo) {
    const amostra = linhas.slice(1, 400);
    chaves.forEach((chave, i) => {
      if (reservadas.has(i) || ignorarPorNome.test(chave)) return;
      let preenchidas = 0;
      let numeros = 0;
      amostra.forEach((l) => {
        const v = String(l[i] ?? '').trim();
        if (!v) return;
        preenchidas++;
        if (/^-?[\d.]+$/.test(v)) numeros++;
      });
      if (preenchidas > 0 && numeros / preenchidas >= 0.9) numericas.push(i);
    });
  }

  return {
    municipio,
    uf,
    formatoLongo,
    numeroCandidato,
    nomeCandidato,
    votosLongo,
    cargoLongo,
    anoLongo,
    partidoLongo,
    numericas,
    codigoIbge,
    percentuais,
    totalizadas,
    observacao
  };
}

export function numeroDecimal(valor: unknown): number | null {
  const s = String(valor ?? '').trim().replace('%', '');
  if (!s) return null;
  const normal = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

export function linhaEhTotal(nome: string): boolean {
  const chave = chaveMunicipio(nome);
  return /^(TOTAL|TOTAIS|SOMA|MINAS GERAIS$|ESTADO$)/.test(chave);
}

export function acharColunaDePercentual(cabecalho: string[], colunas: ColunasMinas, numero: string, cargo: string): number {
  const n = String(numero || '').replace(/\D/g, '');
  if (!n) return -1;
  const candidatas = colunas.percentuais.filter((i) => normalizarChave(cabecalho[i]).split('_').includes(n));
  if (candidatas.length === 0) return -1;
  const doCargo = candidatas.find((i) => normalizarChave(cabecalho[i]).split('_').includes(cargo));
  return doCargo ?? candidatas[0];
}

export function lerObservacoes(linhas: string[][], colunas: ColunasMinas): Record<string, { partido: string; situacao: string }> {
  const saida: Record<string, { partido: string; situacao: string }> = {};
  if (colunas.observacao < 0) return saida;
  linhas.slice(1).forEach((l) => {
    const texto = String(l?.[colunas.observacao] ?? '').trim();
    if (!texto) return;
    texto.split('|').forEach((parte) => {
      const m = /^\s*(\d{2,5})\s+[^()]*\(([^)]+)\)\s*(.*)$/.exec(parte);
      if (m) saida[m[1]] = { partido: m[2].trim().toUpperCase(), situacao: m[3].trim() };
    });
  });
  return saida;
}

export interface LeituraMinas {
  porNome: Map<string, { votos: number; pct: number | null; cod: string }>;
  totaisInformados: number[];
  municipiosParciais: number;
}

export function lerVotosPorMunicipio(
  linhas: string[][],
  colunas: ColunasMinas,
  filtro: FiltroLinhaMinas & { colunaPct?: number }
): LeituraMinas {
  const porNome: LeituraMinas['porNome'] = new Map();
  const totaisInformados: number[] = [];
  let municipiosParciais = 0;
  if (colunas.municipio < 0) return { porNome, totaisInformados, municipiosParciais };
  const numeroAlvo = filtro.numeroCandidato ? filtro.numeroCandidato.replace(/\D/g, '') : '';
  const cargoAlvo = filtro.cargoContem ? chaveMunicipio(filtro.cargoContem) : '';
  const parciaisVistos = new Set<string>();

  for (let i = 1; i < linhas.length; i++) {
    const l = linhas[i];
    if (!l) continue;
    if (colunas.uf >= 0) {
      const uf = String(l[colunas.uf] ?? '').trim().toUpperCase();
      if (uf && uf !== 'MG' && uf !== 'MINAS GERAIS') continue;
    }
    if (colunas.formatoLongo) {
      if (numeroAlvo && String(l[colunas.numeroCandidato] ?? '').replace(/\D/g, '') !== numeroAlvo) continue;
      if (cargoAlvo && colunas.cargoLongo >= 0 && !chaveMunicipio(String(l[colunas.cargoLongo] ?? '')).includes(cargoAlvo)) continue;
    }
    const nome = String(l[colunas.municipio] ?? '').trim();
    if (!nome) continue;
    const votos = numeroDeVotos(l[filtro.colunaVotos]);
    if (linhaEhTotal(nome)) {
      if (votos !== null) totaisInformados.push(votos);
      continue;
    }
    if (votos === null) continue;

    if (colunas.totalizadas >= 0) {
      const t = numeroDecimal(l[colunas.totalizadas]);
      if (t !== null && t < 100 && !parciaisVistos.has(nome)) {
        parciaisVistos.add(nome);
        municipiosParciais++;
      }
    }
    const cod = colunas.codigoIbge >= 0 ? String(l[colunas.codigoIbge] ?? '').replace(/\D/g, '') : '';
    const pct = filtro.colunaPct !== undefined && filtro.colunaPct >= 0 ? numeroDecimal(l[filtro.colunaPct]) : null;
    const atual = porNome.get(nome);
    if (atual) {
      atual.votos += votos;
      atual.pct = null;
    } else {
      porNome.set(nome, { votos, pct, cod });
    }
  }
  return { porNome, totaisInformados, municipiosParciais };
}

export interface FiltroLinhaMinas {
  colunaVotos: number;
  numeroCandidato?: string;
  cargoContem?: string;
}

function distanciaDeEdicao(a: string, b: string, limite: number): number {
  if (Math.abs(a.length - b.length) > limite) return limite + 1;
  let anterior = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    let menorDaLinha = i;
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + custo);
      atual.push(v);
      if (v < menorDaLinha) menorDaLinha = v;
    }
    if (menorDaLinha > limite) return limite + 1;
    anterior = atual;
  }
  return anterior[b.length];
}

export interface ResultadoCorrespondencia {
  porCodigo: Map<string, number>;
  pctPorCodigo: Map<string, number>;
  pelosCodigos: number;
  aproximados: Array<{ nomeArquivo: string; cod: string; nomeOficial: string; votos: number }>;
  semCorrespondencia: Array<{ nome: string; votos: number }>;
}

export function casarMunicipios(
  dados: Map<string, number> | LeituraMinas['porNome'],
  malha: MunicipioMG[]
): ResultadoCorrespondencia {
  const porChave = new Map<string, MunicipioMG>();
  const porCod = new Map<string, MunicipioMG>();
  malha.forEach((m) => {
    porChave.set(m.chave, m);
    porCod.set(m.cod, m);
  });

  const porCodigo = new Map<string, number>();
  const pctPorCodigo = new Map<string, number>();
  const pendentes: Array<{ nome: string; chave: string; votos: number; pct: number | null }> = [];
  const usados = new Set<string>();
  let pelosCodigos = 0;

  const somar = (m: MunicipioMG, votos: number, pct: number | null) => {
    const jaTinha = porCodigo.has(m.cod);
    porCodigo.set(m.cod, (porCodigo.get(m.cod) || 0) + votos);
    if (pct !== null && !jaTinha) pctPorCodigo.set(m.cod, pct);
    else pctPorCodigo.delete(m.cod);
    usados.add(m.cod);
  };

  dados.forEach((valor: number | { votos: number; pct: number | null; cod: string }, nome: string) => {
    const registro = typeof valor === 'number' ? { votos: valor, pct: null, cod: '' } : valor;
    const peloCodigo = registro.cod ? porCod.get(registro.cod) : undefined;
    if (peloCodigo) {
      somar(peloCodigo, registro.votos, registro.pct);
      pelosCodigos++;
      return;
    }
    const chave = chaveMunicipio(nome);
    const m = porChave.get(chave);
    if (m) somar(m, registro.votos, registro.pct);
    else pendentes.push({ nome, chave, votos: registro.votos, pct: registro.pct });
  });

  const aproximados: ResultadoCorrespondencia['aproximados'] = [];
  const semCorrespondencia: ResultadoCorrespondencia['semCorrespondencia'] = [];
  const livres = malha.filter((m) => !usados.has(m.cod));

  pendentes.forEach((p) => {
    const candidatos = livres.filter((m) => !usados.has(m.cod) && distanciaDeEdicao(p.chave, m.chave, 2) <= 2);
    if (candidatos.length === 1) {
      const m = candidatos[0];
      somar(m, p.votos, p.pct);
      aproximados.push({ nomeArquivo: p.nome, cod: m.cod, nomeOficial: m.nome, votos: p.votos });
    } else {
      semCorrespondencia.push({ nome: p.nome, votos: p.votos });
    }
  });

  semCorrespondencia.sort((a, b) => b.votos - a.votos);
  return { porCodigo, pctPorCodigo, pelosCodigos, aproximados, semCorrespondencia };
}

export function montarMunicipios(resultado: ResultadoCorrespondencia): MinasArquivo['municipios'] {
  const municipios: MinasArquivo['municipios'] = [];
  resultado.porCodigo.forEach((votos, cod) => {
    const pct = resultado.pctPorCodigo.get(cod);
    municipios.push(pct !== undefined ? [cod, votos, pct] : [cod, votos]);
  });
  municipios.sort((a, b) => b[1] - a[1]);
  return municipios;
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
