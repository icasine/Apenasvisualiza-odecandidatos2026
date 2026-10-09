
export type CargoId = 'vereador' | 'depfed' | 'depest' | 'prefeito' | 'prefeito2';

export const CARGOS_DISPONIVEIS: Record<CargoId, string> = {
  vereador: 'Vereador',
  depfed: 'Deputado federal',
  depest: 'Deputado estadual',
  prefeito: 'Prefeito (1º turno)',
  prefeito2: 'Prefeito (2º turno)'
};

export type TipoItemEleitoral = 'candidato' | 'legenda' | 'total_partido' | 'outros';

export const NOMES_TIPOS_ITEM: Record<TipoItemEleitoral, string> = {
  candidato: 'Candidato',
  legenda: 'Legenda do Partido',
  total_partido: 'Total do Partido',
  outros: 'Outros'
};

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

export interface CandidatoArquivoData {
  candidatoId: string;
  nome: string;
  pessoa?: string;
  numero: string;
  cargo: CargoId;
  ano: string;
  tipo?: TipoItemEleitoral;
  partido?: string;
  totalVotos: number;
  totalSecoes: number;
  secoes: SecaoVotoCandidato[];
  lotes: LoteEnvio[];
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

export interface SecaoEleitorado {
  zona: string;
  secao: string;
  aptos: number;
}

export interface SecaoCorrespondencia {
  zona: string;
  secao: string;
  zona_destino: string;
  secao_destino: string;
  situacao: string;
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
  tab: 'mapa' | 'tabela' | 'minas' | 'perfis' | 'territorios' | 'acoes' | 'campanha' | 'relatorio' | 'gestao';
  tabelaSubSecao: 'dados' | 'ranking' | 'conferencia';
  compararDe?: string;
  compararPara?: string;
  eleicoesDesligadas?: string[];
  redesLigadas?: string[];
  camadasExtras?: string[];
}

export const ehCargoMajoritario = (cargo?: string): boolean => String(cargo || '').startsWith('prefeito');

export function itemLigado(c: { cargo?: string; ano?: string }, desligadas: string[] = []): boolean {
  if (desligadas.includes(ehCargoMajoritario(c.cargo) ? 'majoritarias' : 'proporcionais')) return false;
  if (desligadas.includes(`ano:${c.ano}`)) return false;
  return true;
}

export interface ConflitoSecaoLote {
  zona: string;
  secao: string;
  local_votacao_num: string;
  votosAntigos: number;
  votosNovos: number;
  loteAntigoNome?: string;
}

export interface DuplicadoSecaoDetalhe {
  ano: string;
  cargo: CargoId;
  candidatoId: string;
  candidatoNome: string;
  tipo: TipoItemEleitoral;
  partido?: string;
  numero: string;
  zona: string;
  secao: string;
  ocorrencias: Array<{
    loteId: string;
    loteNome: string;
    dataHora: string;
    votos: number;
  }>;
}

export interface PreviaArquivoCandidato {
  nome: string;
  numero: string;
  cargo: CargoId;
  ano: string;
  nomeArquivoDestino: string;
  caminhoRelativo: string;
  totalLinhas: number;
  totalSecoes: number;
  totalLocais: number;
  totalVotos: number;
  totalEleitores: number;
  totaisPorZona: Record<string, { votos: number; eleitores: number; secoes: number }>;
  linhas: Array<{
    zona: string;
    secao: string;
    local_votacao_num: string;
    votos: number;
    aptos: number;
    latitude?: number | null;
    longitude?: number | null;
    nome_local?: string;
    bairro?: string;
    aviso?: string;
  }>;
  colunasOriginais: string[];
  mapeamentoColunas: Record<string, string>;
  colunasIgnoradas?: string[];
  avisos: Array<{
    tipo: 'ignorado' | 'sem_coordenada' | 'duplicada' | 'agregada' | 'valor_invalido';
    texto: string;
    detalhes?: string;
  }>;
  jaExisteSubstituicao: boolean;
  loteInfo?: {
    nomeArquivo: string;
    totalSecoesArquivo: number;
    totalVotosArquivo: number;
  };
  secoesNovasCount?: number;
  secoesExistentesCount?: number;
  conflitos?: ConflitoSecaoLote[];
}

export interface LinhaPreviaItem {
  zona: string;
  secao: string;
  local_votacao_num: string;
  votos: number;
  aptos: number;
  latitude?: number | null;
  longitude?: number | null;
  nome_local?: string;
  bairro?: string;
  status: 'nova' | 'igual' | 'conflito' | 'repetida_no_arquivo';
  votoAntigo?: number;
  aviso?: string;
}

export interface PreviaItemLote {
  colunaOriginal: string;
  tipo: TipoItemEleitoral;
  nome: string;
  numero: string;
  partido: string;
  cargo: CargoId;
  ano: string;
  candidatoId: string;
  nomeArquivoDestino: string;
  caminhoArquivo: string;
  totalVotosArquivo: number;
  totalSecoesArquivo: number;
  secoesNovasCount: number;
  secoesIguaisCount: number;
  secoesConflitosCount: number;
  secoesRepetidasArquivoCount: number;
  secoesSemDadoCount: number;
  valoresInvalidos: Array<{ linha: number; zona: string; secao: string; valor: string }>;
  repetidas: Array<{ zona: string; secao: string; valores: number[]; usado: number }>;
  secoesSemLocalCount: number;
  conflitos: ConflitoSecaoLote[];
  linhas: LinhaPreviaItem[];
  acaoConflito: 'substituir' | 'manter_antigo' | 'cancelar';
}

export interface PreviaMultiplosItens {
  nomeArquivoOriginal: string;
  totalLinhasArquivo: number;
  itens: PreviaItemLote[];
  colunasIgnoradas: string[];
}

export interface CorrespondenciaLocaisArquivo {
  referencia: string;
  atualizacao?: string | null;
  anos: Record<string, Record<string, string>>;
}

export interface PreviaArquivoLocais {
  ano: string;
  caminhoRelativo: string;
  caminhoAno: string;
  totalLinhas: number;
  totalSecoes: number;
  totalLocais: number;
  totalAgregadas: number;
  totalEleitores: number;
  totalEleitoresAgregadas: number;
  zonasEncontradas: string[];
  totaisPorZona: Record<
    string,
    { secoes: number; locais: number; eleitores: number; agregadas: number; eleitoresAgregadas: number }
  >;
  bairrosEncontrados: string[];
  linhas: LocalVotacao[];
  agregadas: SecaoCorrespondencia[];
  eleitorado: SecaoEleitorado[];
  colunasOriginais: string[];
  colunasReconhecidas: Record<string, string>;
  colunasIgnoradas: string[];
  mapeamentoColunas: Record<string, string>;
  avisos: Array<{
    tipo: 'sem_coordenada' | 'coordenada_invalida' | 'ignorado' | 'duplicada' | 'agregada';
    texto: string;
  }>;
}

export interface AdminSession {
  isAuthenticated: boolean;
  username: string;
  loginMethod: 'github_pat';
  loginTime: string;
  expiresAt: number;
}

export interface ErroEnvioDetalhado {
  passo: 'leitura' | 'previa' | 'gravacao';
  titulo: string;
  mensagem: string;
  statusHttp?: number;
  respostaApi?: any;
  detalhesTecnicos?: string;
}

export interface AlteracaoDeItem {
  id: string;
  info?: CandidatoInfo;
  secoes?: SecaoVotoCandidato[];
  removido?: boolean;
}
