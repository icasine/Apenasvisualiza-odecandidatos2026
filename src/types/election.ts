
export type CargoId = 'vereador' | 'depfed' | 'depest' | 'prefeito' | 'prefeito2';

export const CARGOS_DISPONIVEIS: Record<CargoId, string> = {
  vereador: 'Vereador',
  depfed: 'Deputado federal',
  depest: 'Deputado estadual',
  prefeito: 'Prefeito (1º turno)',
  prefeito2: 'Prefeito (2º turno)'
};

export type TipoItemEleitoral = 'candidato' | 'legenda' | 'total_partido' | 'outros';

export interface LoteEnvio {
  id: string;
  dataHora: string;
  nomeArquivo: string;
  totalSecoes: number;
  totalVotos: number;
  secoesEnviadas?: number;
  votosEnviados?: number;
  temDuplicados?: boolean;
  duplicadosCount?: number;
}

export interface SecaoVotoCandidato {
  zona: string;
  secao: string;
  local_votacao_num?: string;
  votos: number;
  aptos?: number;
  loteId?: string;
  dataHora?: string;
}

export interface CandidatoInfo {
  id: string;
  ano: string;
  cargo: CargoId;
  tipo?: TipoItemEleitoral;
  partido?: string;
  pessoa?: string;
  numero: string;
  nome: string;
  arquivo: string;
  totalVotos?: number;
  totalSecoes?: number;
  lotes?: LoteEnvio[];
  cor: string;
  temDuplicados?: boolean;
  duplicadosCount?: number;
}

export interface LocalVotacao {
  zona: string;
  secao: string;
  local_votacao_num: string;
  nome_local: string;
  endereco: string;
  bairro: string;
  cep?: string;
  latitude: number | null;
  longitude: number | null;
  aptos?: number;
  tipoSecao?: 'Principal' | 'Agregada';
  secaoPrincipal?: string;
}

export interface IndiceData {
  municipio: string;
  uf: string;
  atualizacao: string | null;
  anos: string[];
  zonas?: string[];
  candidatos: CandidatoInfo[];
  locais?: Record<string, string>;
  eleitorados?: Record<string, string>;
  agregadas?: Record<string, string>;
}

export interface SecaoVisualizacao {
  zona: string;
  secao: string;
  local_num: string;
  nome_local: string;
  endereco: string;
  bairro: string;
  cep?: string;
  latitude: number | null;
  longitude: number | null;
  aptos: number;
  isAgregada: boolean;
  secaoDestino?: string;
  zonaDestino?: string;
  secoesAgregadasAEsta?: string[];
  aptosBaseCalculo: number;
  descricaoSecao: string;
  votosPorCandidato: Record<string, number>;
  votosTotalMarcados: number;
  pctSobreEleitores: number;
  anoDoCadastro?: string;
  aptosPorAno?: Record<string, number>;
}

export interface LocalAgrupado {
  key: string;
  zona: string;
  local_num: string;
  nome_local: string;
  endereco: string;
  bairro: string;
  cep?: string;
  latitude: number | null;
  longitude: number | null;
  secoes: SecaoVisualizacao[];
  totalEleitoresAptos: number;
  votosPorCandidato: Record<string, number>;
  totalVotosMarcados: number;
  pctSobreEleitores: number;
  anosPresentes?: string[];
  eleitoresPorAno?: Record<string, number>;
  semCorrespondencia?: string[];
  comparacao?: {
    deId: string;
    paraId: string;
    votosDe: number | null;
    votosPara: number | null;
    diferencaVotos: number | null;
    pctDe: number | null;
    pctPara: number | null;
    diferencaPct: number | null;
  };
}

export type ModoVisualizacao = 'somar' | 'lado_a_lado' | 'diferenca';

export interface FilterState {
  candidatosSelecionados: string[];
  modoVisualizacao: ModoVisualizacao;
  zonas: string[];
  bairro: string;
  buscaLocal: string;
  secaoFiltro: string;
  faixaMinVotos: number | null;
  faixaMaxVotos: number | null;
  tab: 'mapa' | 'tabela' | 'minas';
  tabelaSubSecao: 'dados' | 'ranking' | 'conferencia';
  compararDe?: string;
  compararPara?: string;
  eleicoesDesligadas?: string[];
  redesLigadas?: string[];
  camadasExtras?: string[];
  somarFederacoes?: boolean;
}

export const ehCargoMajoritario = (cargo?: string): boolean => String(cargo || '').startsWith('prefeito');

export function itemLigado(c: { cargo?: string; ano?: string }, desligadas: string[] = []): boolean {
  if (desligadas.includes(ehCargoMajoritario(c.cargo) ? 'majoritarias' : 'proporcionais')) return false;
  if (desligadas.includes(`ano:${c.ano}`)) return false;
  return true;
}

export interface CorrespondenciaLocaisArquivo {
  referencia: string;
  atualizacao?: string | null;
  anos: Record<string, Record<string, string>>;
}

export interface AdminSession {
  isAuthenticated: boolean;
  username: string;
  loginMethod: 'github_pat';
  loginTime: string;
  expiresAt: number;
}

