import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Navbar } from './components/Header/Navbar';
import { TopSummaryBar } from './components/Summary/TopSummaryBar';
import { FilterDrawer } from './components/Filters/FilterDrawer';
import { VotingMap } from './components/Map/VotingMap';
import { LocalDetailPanel } from './components/Details/LocalDetailPanel';
import { SectionsTable } from './components/Table/SectionsTable';
import { OfflineIndicator } from './components/PWA/OfflineIndicator';
import { LoginScreen } from './components/Acesso/LoginScreen';
import { MinasView } from './components/Minas/MinasView';
import { chavePerfil, Federacao, fotoDosItens, lerFederacoes, lerFotos, lerFotosProprias, lerPerfis, lerTemas, nomeArquivoFoto, PerfilCandidato, seguidoresDe } from './utils/perfis';
import { juntarItensDeFederacao, partidoComFederacao } from './utils/federacoes';
import { chaveDaPessoa as chaveDaPessoaItem } from './utils/itens';
import {
  CandidatoInfo,
  CorrespondenciaLocaisArquivo,
  FilterState,
  IndiceData,
  LocalAgrupado,
  LocalVotacao,
  SecaoVotoCandidato,
  itemLigado
} from './types/election';
import { getAdminSession, getStoredGitHubToken } from './utils/adminAuth';
import { fetchDataFileDirectFromAPI } from './utils/dataLoader';
import { acessoAtivo, atualizarDadosDoAcesso, atualizarPermissoes, iniciarDadosDoAcesso, lerSessao, limparCacheDoServico, limparCopiasDoAcesso, podeEditarDados, sairDoAcesso } from './utils/acesso';
import { AvisoDeCarga, TelaDeCarga } from './components/Acesso/AvisoDeCarga';
import { useDadosNovosNoAcesso } from './hooks/useProgressoDoAcesso';
import { preCarregarMinas } from './utils/minas';
import { consolidar, DadosDoAno, sugerirComparacao } from './utils/consolidacao';
import {
  validarAgregadas,
  validarSecoesExtintas,
  resolverCadeiaDeSecoes,
  validarCorrespondencia,
  validarEleitorado,
  validarIndice,
  validarLocais,
  validarVotos
} from './utils/validacao';

const DEFAULT_FILTERS: FilterState = {
  candidatosSelecionados: [],
  modoVisualizacao: 'somar',
  zonas: [],
  bairro: '',
  buscaLocal: '',
  secaoFiltro: '',
  faixaMinVotos: null,
  faixaMaxVotos: null,
  tab: 'mapa',
  tabelaSubSecao: 'dados',
  compararDe: '',
  compararPara: '',
  eleicoesDesligadas: ['majoritarias']
};

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

function lerCacheLocal<T>(chave: string): T | null {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? (JSON.parse(bruto) as T) : null;
  } catch {
    return null;
  }
}


interface DadosLidosDoAno {
  locais: LocalVotacao[];
  eleitorado: Record<string, number>;
  agregadas: Record<string, string>;
  extintas?: Record<string, string>;
  avisos: string[];
}

function anoMaisNovo(anos: string[]): string | null {
  const validos = anos.filter((a) => /^\d{4}$/.test(a)).sort();
  return validos.length > 0 ? validos[validos.length - 1] : null;
}

export default function App() {
  const [indice, setIndice] = useState<IndiceData | null>(null);
  const [, setPermissoesTick] = useState(0);
  useEffect(() => { if (acessoAtivo() && lerSessao()) atualizarPermissoes().then((mudou) => { if (mudou) setPermissoesTick((n) => n + 1); }); lerTemas().then(() => setPermissoesTick((n) => n + 1)).catch(() => null); }, []);
  const [dadosLidos, setDadosLidos] = useState<Record<string, DadosLidosDoAno>>({});
  const [correspondencia, setCorrespondencia] = useState<CorrespondenciaLocaisArquivo | null>(null);
  const [votosMap, setVotosMap] = useState<Record<string, SecaoVotoCandidato[]>>({});
  const [errosDeCarga, setErrosDeCarga] = useState<Record<string, string>>({});
  const [avisosDeVotos, setAvisosDeVotos] = useState<Record<string, string>>({});
  const [avisosFechados, setAvisosFechados] = useState<string[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [semResposta, setSemResposta] = useState(false);
  const dadosNovos = useDadosNovosNoAcesso();
  const [selectedLocalKey, setSelectedLocalKey] = useState<string | null>(null);
  const [isFilterDrawerOpenMobile, setIsFilterDrawerOpenMobile] = useState<boolean>(false);
  const buscasEmAndamento = useRef<Set<string>>(new Set());
  const [adminSession] = useState(() => getAdminSession());

  const sessaoAcesso = useMemo(() => lerSessao(), []);
  const exigeLogin = acessoAtivo() && !sessaoAcesso;
  const podeEditar = podeEditarDados();

  const [filters, setFilters] = useState<FilterState>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const modoParam = params.get('modo');
      const zonasParam = params.get('zonas');
      const tabParam = params.get('tab');
      const compParam = (params.get('comp') || '').split(',');
      const tabInicial: FilterState['tab'] =
        tabParam === 'tabela' || tabParam === 'minas' ? tabParam : 'mapa';

      return {
        ...DEFAULT_FILTERS,
        candidatosSelecionados: [],
        modoVisualizacao: modoParam === 'lado_a_lado' || modoParam === 'diferenca' ? modoParam : 'somar',
        zonas: zonasParam ? zonasParam.split(',').filter(Boolean) : [],
        tab: tabInicial,
        compararDe: compParam.length === 2 ? compParam[0] : '',
        compararPara: compParam.length === 2 ? compParam[1] : '',
        somarFederacoes: params.get('fed') === '1'
      };
    } catch {
      return DEFAULT_FILTERS;
    }
  });

  useEffect(() => {
    try {
      const params = new URLSearchParams();
      if (filters.modoVisualizacao !== 'somar') {
        params.set('modo', filters.modoVisualizacao);
      }
      if (filters.zonas.length > 0) {
        params.set('zonas', filters.zonas.join(','));
      }
      if (filters.tab !== 'mapa') {
        params.set('tab', filters.tab);
      }
      if (filters.compararDe && filters.compararPara && filters.compararDe !== 'nenhum') {
        params.set('comp', `${filters.compararDe},${filters.compararPara}`);
      }
    if (filters.somarFederacoes) {
        params.set('fed', '1');
      }
      const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
      window.history.replaceState(null, '', newUrl);
    } catch (e) {
      console.warn('Falha ao sincronizar URL:', e);
    }
  }, [filters]);

  const anoReferencia = useMemo(() => {
    if (!indice) return '2026';
    const comLocais = Object.keys(indice.locais || {});
    if (correspondencia && comLocais.includes(correspondencia.referencia)) return correspondencia.referencia;
    return anoMaisNovo(comLocais) || anoMaisNovo(indice.anos || []) || '2026';
  }, [indice, correspondencia]);

  useEffect(() => {
    async function carregarDados() {
      if (exigeLogin) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);

        if (acessoAtivo() && !(getStoredGitHubToken() && podeEditarDados())) {
          await iniciarDadosDoAcesso(filters.candidatosSelecionados);
        }

        const [indiceBruto, correspondenciaBruta] = await Promise.all([
          fetchDataFileDirectFromAPI<unknown>('data/indice.json').catch(() => null),
          fetchDataFileDirectFromAPI<unknown>('data/correspondencia_locais.json').catch(() => null)
        ]);
        const indicePublicado = validarIndice(indiceBruto);
        if (acessoAtivo() && !indicePublicado) setSemResposta(true);

        try {
          Object.keys(localStorage)
            .filter((k) => k.startsWith('contagem_votos_'))
            .forEach((k) => localStorage.removeItem(k));
        } catch {}

        let loadedIndice: IndiceData = indicePublicado || INDICE_VAZIO;
        if (!indicePublicado && !acessoAtivo()) {
          const guardado = validarIndice(lerCacheLocal<unknown>('contagem_indice_custom'));
          if (guardado) loadedIndice = guardado;
        }

        setIndice(loadedIndice);
        const anosDoIndice = Array.from(new Set(loadedIndice.candidatos.map((c) => String(c.ano)))).sort();
        const anoMaisRecente = anosDoIndice[anosDoIndice.length - 1];
          setFilters((prev) => ({
          ...prev,
          eleicoesDesligadas: Array.from(new Set([...(prev.eleicoesDesligadas || []), ...anosDoIndice.filter((a) => a !== anoMaisRecente && a !== '2024').map((a) => `ano:${a}`)]))
        }));
        setCorrespondencia(validarCorrespondencia(correspondenciaBruta));

        setLoading(false);
      } catch (err) {
        console.error('Erro ao inicializar dados:', err);
        setLoading(false);
      }
    }

    carregarDados();
  }, []);

  useEffect(() => {
    if (exigeLogin) limparCopiasDoAcesso();
  }, [exigeLogin]);

  useEffect(() => {
    if (!indice || exigeLogin || !acessoAtivo()) return;
    const t = setTimeout(() => preCarregarMinas(), 2500);
    return () => clearTimeout(t);
  }, [Boolean(indice), exigeLogin]);

  const candidatosMarcados = useMemo<CandidatoInfo[]>(() => {
    if (!indice) return [];
    const marcados = new Set(filters.candidatosSelecionados);
    return indice.candidatos.filter((c) => marcados.has(c.id) && itemLigado(c, filters.eleicoesDesligadas));
  }, [indice, filters.candidatosSelecionados, filters.eleicoesDesligadas]);

  const [perfisCarregados, setPerfisCarregados] = useState<PerfilCandidato[] | null>(null);
  useEffect(() => {
    if (!indice || perfisCarregados) return;
    lerPerfis().then((a) => setPerfisCarregados(a.perfis)).catch(() => setPerfisCarregados([]));
  }, [indice, perfisCarregados]);
  const [fotosTse, setFotosTse] = useState<Record<string, string>>({});
  const [fotosProprias, setFotosProprias] = useState<Set<string>>(new Set());
  const fotosPedidas = useRef(false);
  useEffect(() => {
    if (candidatosMarcados.length === 0 || fotosPedidas.current) return;
    fotosPedidas.current = true;
    lerFotos().then(setFotosTse).catch(() => setFotosTse({}));
    lerFotosProprias().then(setFotosProprias).catch(() => setFotosProprias(new Set()));
  }, [candidatosMarcados.length]);
  const fotoDaPessoa = useCallback(
    (nome: string, itens: CandidatoInfo[]) => {
      const chave = chavePerfil(nome);
      const perfil = (perfisCarregados || []).find((p) => !p.teste && chavePerfil(p.pessoa) === chave);
      const arquivo = nomeArquivoFoto(nome);
      return perfil?.foto || (fotosProprias.has(arquivo) ? '/fotos/' + arquivo : fotoDosItens(fotosTse, itens));
    },
    [perfisCarregados, fotosProprias, fotosTse]
  );
  const seguidoresMarcados = useMemo(() => {
    const redes = filters.redesLigadas || [];
    if (redes.length === 0 || !perfisCarregados || candidatosMarcados.length === 0) return null;
    const pessoas = new Set(candidatosMarcados.map((c) => chaveDaPessoaItem(c)));
    let total = 0;
    let comPerfil = 0;
    perfisCarregados.forEach((p) => {
      if (!p.teste && pessoas.has(chavePerfil(p.pessoa))) {
        total += seguidoresDe(p, redes);
        comPerfil++;
      }
    });
    return { total, comPerfil, pessoas: pessoas.size };
  }, [filters.redesLigadas, perfisCarregados, candidatosMarcados]);

  const carregarVotos = useCallback((cand: CandidatoInfo) => {
    if (buscasEmAndamento.current.has(cand.id)) return;
    buscasEmAndamento.current.add(cand.id);
    setErrosDeCarga((prev) => {
      if (!prev[cand.id]) return prev;
      const copia = { ...prev };
      delete copia[cand.id];
      return copia;
    });

    fetchDataFileDirectFromAPI<unknown>(cand.arquivo)
      .catch(() => null)
      .then((data) => {
        const validado = validarVotos(data);
        if (!validado) {
          setErrosDeCarga((prev) => ({
            ...prev,
            [cand.id]: `Não foi possível carregar os votos de ${cand.nome} (${cand.ano}). Os números dele não estão na tela.`
          }));
          return;
        }
        if (validado.avisos.length > 0) {
          setAvisosDeVotos((prev) => ({ ...prev, [cand.id]: `${cand.nome} (${cand.ano}): ${validado.avisos.join(' ')}` }));
        }
        setVotosMap((prev) => ({ ...prev, [cand.id]: validado.dados }));
      })
      .finally(() => buscasEmAndamento.current.delete(cand.id));
  }, []);

  const paraCarregar = candidatosMarcados;
  useEffect(() => {
    if (!indice) return;
    paraCarregar.forEach((cand) => {
      if (!votosMap[cand.id] && !errosDeCarga[cand.id]) carregarVotos(cand);
    });
  }, [paraCarregar, indice, votosMap, errosDeCarga, carregarVotos]);

  useEffect(() => {
    if (!indice || exigeLogin) return;

    const anos = Array.from(new Set([anoReferencia, ...paraCarregar.map((c) => String(c.ano))]));
    const indiceListaArquivos = Object.keys(indice.locais || {}).length > 0;

    anos.forEach((ano) => {
      if (dadosLidos[ano] || buscasEmAndamento.current.has(`ano_${ano}`)) return;
      buscasEmAndamento.current.add(`ano_${ano}`);

      const caminhoLocais = indice.locais?.[ano] || (ano === anoReferencia || !indiceListaArquivos ? (ano === anoReferencia ? 'data/locais.json' : `data/${ano}/locais.json`) : null);
      const caminhoEleitorado = indice.eleitorados?.[ano] || (!indiceListaArquivos ? `data/${ano}/eleitorado.json` : null);
      const caminhoAgregadas = indice.agregadas?.[ano] || (!indiceListaArquivos ? `data/${ano}/agregadas.json` : null);
      const buscar = (caminho: string | null) =>
        caminho ? fetchDataFileDirectFromAPI<unknown>(caminho).catch(() => null) : Promise.resolve(null);

      Promise.all([buscar(caminhoLocais), buscar(caminhoEleitorado), buscar(caminhoAgregadas)])
        .then(([locaisBrutos, eleitoradoBruto, agregadasBrutas]) => {
          const avisos: string[] = [];
          let locais: LocalVotacao[] = [];
          const validados = validarLocais(locaisBrutos);
          if (validados) {
            locais = validados.dados;
            validados.avisos.forEach((a) => avisos.push(`Locais de ${ano}: ${a}`));
          } else if (ano === anoReferencia && !acessoAtivo()) {
            locais = validarLocais(lerCacheLocal<unknown>('contagem_locais_custom'))?.dados || [];
          }
          const eleitorado =
            validarEleitorado(eleitoradoBruto) ||
            (acessoAtivo() ? null : lerCacheLocal<Record<string, number>>(`contagem_eleitorado_${ano}`)) ||
            {};
          const agregadas =
            validarAgregadas(agregadasBrutas) ||
            (acessoAtivo() ? null : lerCacheLocal<Record<string, string>>(`contagem_agregadas_${ano}`)) ||
            {};
          const extintas = validarSecoesExtintas(agregadasBrutas) || {};
          setDadosLidos((prev) => ({ ...prev, [ano]: { locais, eleitorado, agregadas, extintas, avisos } }));
        })
        .finally(() => buscasEmAndamento.current.delete(`ano_${ano}`));
    });
  }, [indice, exigeLogin, anoReferencia, paraCarregar, dadosLidos]);

  const dadosPorAno = useMemo<Record<string, DadosDoAno>>(() => {
    const saida: Record<string, DadosDoAno> = {};
    const referencia = dadosLidos[anoReferencia];
    (Object.entries(dadosLidos) as Array<[string, DadosLidosDoAno]>).forEach(([ano, d]) => {
      if (d.locais.length > 0 || ano === anoReferencia || !referencia) {
        saida[ano] = { ano, locais: d.locais, eleitorado: d.eleitorado, agregadas: d.agregadas };
      } else {
        const temAgregadas = Object.keys(d.agregadas || {}).length > 0;
        const mapa: Record<string, string> = { ...(temAgregadas ? d.agregadas : referencia.agregadas) };
        let locaisDoAno = referencia.locais;
        if (!temAgregadas && referencia.extintas && Object.keys(referencia.extintas).length > 0) {
          const localDaSecao = new Map<string, LocalVotacao>(referencia.locais.map((l): [string, LocalVotacao] => [`${l.zona}_${l.secao}`, l]));
          const linhasOutras = new Map<string, LocalVotacao>();
          Object.entries(referencia.extintas).forEach(([origem, destino]) => {
            const escola = localDaSecao.get(destino);
            if (!escola) return;
            const secaoOutras = `Outras (${escola.local_votacao_num})`;
            const chave = `${escola.zona}_${secaoOutras}`;
            if (!linhasOutras.has(chave)) linhasOutras.set(chave, { ...escola, secao: secaoOutras, aptos: 0, tipoSecao: 'Principal' });
            mapa[origem] = chave;
          });
          locaisDoAno = [...referencia.locais, ...linhasOutras.values()];
        }
        saida[ano] = {
          ano,
          locais: locaisDoAno,
          eleitorado: d.eleitorado,
          agregadas: resolverCadeiaDeSecoes(mapa),
          locaisEmprestados: true,
          agregadasEmprestadas: !temAgregadas
        };
      }
    });
    return saida;
  }, [dadosLidos, anoReferencia]);


  const votosMapDeduplicado = useMemo(() => {
    const deduplicado: Record<string, SecaoVotoCandidato[]> = {};
    Object.entries(votosMap).forEach(([candId, rows]) => {
      const mapa = new Map<string, SecaoVotoCandidato>();
      (rows as SecaoVotoCandidato[]).forEach((r) => {
        mapa.set(`${r.zona}_${r.secao}`, r);
      });
      deduplicado[candId] = Array.from(mapa.values());
    });
    return deduplicado;
  }, [votosMap]);

  const { itensExcluidosDaSoma, avisosTotalPartido } = useMemo(() => {
    if (filters.modoVisualizacao === 'lado_a_lado' || candidatosMarcados.length < 2) {
      return { itensExcluidosDaSoma: new Set<string>(), avisosTotalPartido: [] as string[] };
    }

    const excluidos = new Set<string>();
    const avisos: string[] = [];

    const totais = candidatosMarcados.filter((c) => c.tipo === 'total_partido');
    for (const tot of totais) {
      const partidoNorm = tot.partido?.trim().toUpperCase();
      if (!partidoNorm) continue;

      const redundantes = candidatosMarcados.filter(
        (c) =>
          c.id !== tot.id &&
          c.ano === tot.ano &&
          c.cargo === tot.cargo &&
          c.partido?.trim().toUpperCase() === partidoNorm &&
          (!c.tipo || c.tipo === 'candidato' || c.tipo === 'legenda')
      );

      if (redundantes.length > 0) {
        redundantes.forEach((r) => excluidos.add(r.id));
        const nomesRedundantes = redundantes.map((r) => r.nome).join(', ');
        avisos.push(
          `O total do ${tot.partido || tot.nome} (${tot.ano}) já inclui os votos de ${nomesRedundantes}. Na soma entra só o total.`
        );
      }
    }

    return {
      itensExcluidosDaSoma: excluidos,
      avisosTotalPartido: avisos
    };
  }, [candidatosMarcados, filters.modoVisualizacao]);

  const [federacoes, setFederacoes] = useState<Federacao[] | null>(null);
  useEffect(() => {
    if (!filters.somarFederacoes || federacoes) return;
    lerFederacoes().then(setFederacoes).catch(() => setFederacoes([]));
  }, [filters.somarFederacoes, federacoes]);
  const visaoFederada = useMemo(
    () => (filters.somarFederacoes && federacoes ? juntarItensDeFederacao(candidatosMarcados, votosMapDeduplicado, federacoes, itensExcluidosDaSoma) : null),
    [filters.somarFederacoes, federacoes, candidatosMarcados, votosMapDeduplicado, itensExcluidosDaSoma]
  );
  const itensDaTela = visaoFederada ? visaoFederada.itens : candidatosMarcados;
  const votosDaTela = visaoFederada ? visaoFederada.votos : votosMapDeduplicado;
  const foraDaSoma = visaoFederada ? visaoFederada.excluidos : itensExcluidosDaSoma;
  const rotuloPartido = useCallback((c: CandidatoInfo) => partidoComFederacao(c, federacoes || []), [federacoes]);

  const parComparacao = useMemo(() => {
    if (filters.compararDe === 'nenhum' || itensDaTela.length < 2) return null;
    const ids = new Set(itensDaTela.map((c) => c.id));
    const de = filters.compararDe || '';
    const para = filters.compararPara || '';
    if (de && para && de !== para && ids.has(de) && ids.has(para)) return { de, para };
    return sugerirComparacao(itensDaTela);
  }, [itensDaTela, filters.compararDe, filters.compararPara]);

  const modoEfetivo = filters.modoVisualizacao === 'diferenca' && !parComparacao ? 'somar' : filters.modoVisualizacao;

  const consolidado = useMemo(() => {
    return consolidar({
      candidatos: itensDaTela,
      votos: votosDaTela,
      dadosPorAno,
      referencia: anoReferencia,
      manual: correspondencia,
      excluidosDaSoma: foraDaSoma,
      comparar: parComparacao
    });
  }, [itensDaTela, votosDaTela, dadosPorAno, anoReferencia, correspondencia, foraDaSoma, parComparacao]);


  const locaisAgrupados: LocalAgrupado[] = consolidado.locais;

  const locaisFiltrados = useMemo(() => {
    return locaisAgrupados.filter((loc) => {
      if (filters.zonas.length > 0 && !filters.zonas.includes(loc.zona)) {
        return false;
      }

      if (filters.bairro && loc.bairro.toLowerCase() !== filters.bairro.toLowerCase()) {
        return false;
      }

      if (filters.buscaLocal.trim()) {
        const term = filters.buscaLocal.toLowerCase().trim();
        const matchesNome = loc.nome_local.toLowerCase().includes(term);
        const matchesEnd = (loc.endereco || '').toLowerCase().includes(term);
        const matchesNum = loc.local_num.includes(term);
        if (!matchesNome && !matchesEnd && !matchesNum) return false;
      }

      if (filters.secaoFiltro.trim()) {
        const sTerm = filters.secaoFiltro.trim().padStart(4, '0');
        const hasSecao = loc.secoes.some((s) => s.secao === sTerm || s.secao.endsWith(filters.secaoFiltro.trim()));
        if (!hasSecao) return false;
      }

      if (filters.faixaMinVotos !== null && loc.totalVotosMarcados < filters.faixaMinVotos) {
        return false;
      }

      return true;
    });
  }, [locaisAgrupados, filters]);

  const semLocalizacaoVisivel = useMemo(() => {
    const filtroDeEscola =
      Boolean(filters.bairro) || Boolean(filters.buscaLocal.trim()) || Boolean(filters.secaoFiltro.trim()) || filters.faixaMinVotos !== null;
    if (filtroDeEscola) return [];
    return consolidado.semLocalizacao.filter((v) => filters.zonas.length === 0 || filters.zonas.includes(v.zona));
  }, [consolidado.semLocalizacao, filters]);

  const resumoGeral = useMemo(() => {
    const votosSemLocal = semLocalizacaoVisivel
      .filter((v) => !foraDaSoma.has(v.candidatoId))
      .reduce((acc, v) => acc + v.votos, 0);
    let votos = votosSemLocal;
    let eleitores = 0;
    locaisFiltrados.forEach((loc) => {
      votos += loc.totalVotosMarcados;
      eleitores += loc.totalEleitoresAptos;
    });

    const totalDoItem = (id: string): number =>
      locaisFiltrados.reduce((acc, l) => acc + (l.votosPorCandidato[id] || 0), 0) +
      semLocalizacaoVisivel.filter((v) => v.candidatoId === id).reduce((acc, v) => acc + v.votos, 0);
    const eleitoresDoAno = (ano: string): number => locaisFiltrados.reduce((acc, l) => acc + (l.eleitoresPorAno?.[ano] || 0), 0);

    const porAno = consolidado.anos.map((ano) => {
      const itens = itensDaTela.filter((c) => c.ano === ano && !foraDaSoma.has(c.id));
      const v = itens.reduce((acc, c) => acc + totalDoItem(c.id), 0);
      const e = eleitoresDoAno(ano);
      return { ano, votos: v, eleitores: e, pct: e > 0 ? (v / e) * 100 : 0 };
    });
    const variosAnos = porAno.length > 1;
    if (variosAnos) eleitores = 0;

    let comparacao: {
      rotuloDe: string;
      rotuloPara: string;
      votosDe: number;
      votosPara: number;
      diferencaVotos: number;
      diferencaPct: number | null;
    } | null = null;
    if (parComparacao) {
      const de = itensDaTela.find((c) => c.id === parComparacao.de);
      const para = itensDaTela.find((c) => c.id === parComparacao.para);
      if (de && para) {
        const vDe = totalDoItem(de.id);
        const vPara = totalDoItem(para.id);
        const eDe = eleitoresDoAno(de.ano);
        const ePara = eleitoresDoAno(para.ano);
        const mesmoRotulo = de.ano !== para.ano;
        comparacao = {
          rotuloDe: mesmoRotulo ? de.ano : `${de.nome.split(' ')[0]} ${de.ano}`,
          rotuloPara: mesmoRotulo ? para.ano : `${para.nome.split(' ')[0]} ${para.ano}`,
          votosDe: vDe,
          votosPara: vPara,
          diferencaVotos: vPara - vDe,
          diferencaPct: eDe > 0 && ePara > 0 ? (vPara / ePara) * 100 - (vDe / eDe) * 100 : null
        };
      }
    }

    return {
      votos,
      eleitores,
      pct: !variosAnos && eleitores > 0 ? (votos / eleitores) * 100 : 0,
      porAno: variosAnos ? porAno : [],
      comparacao,
      votosSemLocal
    };
  }, [locaisFiltrados, semLocalizacaoVisivel, consolidado.anos, itensDaTela, foraDaSoma, parComparacao]);

  const availableZonas = useMemo(() => {
    const set = new Set<string>();
    Object.values(dadosPorAno).forEach((d) => (d as DadosDoAno).locais.forEach((l) => l.zona && set.add(l.zona)));
    Object.values(votosMap).forEach((rows) => {
      (rows as SecaoVotoCandidato[]).forEach((r) => {
        if (r.zona) set.add(r.zona);
      });
    });
    if (indice?.zonas) {
      indice.zonas.forEach((z) => set.add(z));
    }
    return Array.from(set).sort((a, b) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
  }, [dadosPorAno, votosMap, indice]);

  const availableBairros = useMemo(() => {
    return Array.from(new Set(locaisAgrupados.map((l) => l.bairro).filter(Boolean))).sort();
  }, [locaisAgrupados]);

  const selectedLocal = useMemo(() => {
    return locaisAgrupados.find((l) => l.key === selectedLocalKey) || null;
  }, [locaisAgrupados, selectedLocalKey]);

  const handleResetFilters = useCallback(() => {
    setFilters((prev) => ({
      ...DEFAULT_FILTERS,
      candidatosSelecionados: prev.candidatosSelecionados,
      modoVisualizacao: prev.modoVisualizacao,
      compararDe: prev.compararDe,
      compararPara: prev.compararPara,
      tab: prev.tab
    }));
  }, []);




  if (exigeLogin) {
    return <LoginScreen />;
  }

  if (loading && !indice) {
    return <TelaDeCarga titulo="Carregando mapa eleitoral de Contagem/MG..." />;
  }

  if (semResposta) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-white text-slate-800 p-6">
        <div className="w-full max-w-sm text-center space-y-4">
          <h1 className="text-base font-bold text-slate-900">O serviço de acesso não respondeu</h1>
          <p className="text-sm text-slate-700">
            Os dados não chegaram. Isso costuma passar em um ou dois minutos. O seu acesso continua valendo: não é preciso entrar de novo.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="h-11 px-5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold cursor-pointer"
          >
            Tentar de novo
          </button>
          <div>
            <button
              onClick={() => {
                sairDoAcesso();
                window.location.reload();
              }}
              className="h-10 px-4 text-xs font-semibold text-slate-600 underline cursor-pointer"
            >
              Sair
            </button>
          </div>
        </div>
      </div>
    );
  }

  const avisosDaTela: Array<{ chave: string; texto: string; erro?: boolean; tentarDeNovo?: () => void }> = [];
  if (indice && dadosLidos[anoReferencia] && dadosLidos[anoReferencia].locais.length === 0 && (indice.candidatos.length > 0 || Object.keys(indice.locais || {}).length > 0)) {
    avisosDaTela.push({
      chave: 'erro_locais',
      texto: `Não foi possível carregar os locais de votação de ${anoReferencia}. Sem eles o mapa fica vazio.`,
      erro: true,
      tentarDeNovo: () =>
        setDadosLidos((prev) => {
          const copia = { ...prev };
          delete copia[anoReferencia];
          return copia;
        })
    });
  }
  candidatosMarcados.forEach((c) => {
    if (errosDeCarga[c.id]) avisosDaTela.push({ chave: `erro_${c.id}`, texto: errosDeCarga[c.id], erro: true, tentarDeNovo: () => carregarVotos(c) });
    if (avisosDeVotos[c.id]) avisosDaTela.push({ chave: `votos_${c.id}`, texto: avisosDeVotos[c.id] });
  });
  if (podeEditar) consolidado.avisos.forEach((a, i) => avisosDaTela.push({ chave: `ano_${i}_${a.slice(0, 12)}`, texto: a }));
  consolidado.anos.forEach((ano) => (dadosLidos[ano]?.avisos || []).forEach((a, i) => avisosDaTela.push({ chave: `locais_${ano}_${i}`, texto: a })));
  avisosTotalPartido.forEach((a, i) => avisosDaTela.push({ chave: `total_${i}_${a.slice(0, 24)}`, texto: a }));
  const avisosVisiveis = filters.tab === 'mapa' || filters.tab === 'tabela' ? avisosDaTela.filter((a) => a.erro || !avisosFechados.includes(a.chave)) : [];

  const navegacao = (
    <Navbar
          compacto
          currentTab={filters.tab}
          onTabChange={(tab) => setFilters({ ...filters, tab })}
          onToggleFiltersMobile={() => setIsFilterDrawerOpenMobile(true)}
          candidatosCount={candidatosMarcados.length}
          isAdminAuthenticated={Boolean(adminSession?.isAuthenticated)}
          mostrarGestao={false}
          usuarioNome={sessaoAcesso?.nome}
          onSair={() => {
          sairDoAcesso();
          window.location.reload();
          }}
        onAtualizarDados={podeEditar ? () => {
          limparCacheDoServico().then(() => atualizarDadosDoAcesso()).finally(() => window.location.reload());
          } : undefined}
        />
  );

  return (
    <div className="h-dvh flex flex-col overflow-hidden bg-white text-slate-900">
      {(filters.tab === 'minas') && (
        <div className="shrink-0 flex justify-end px-3 py-1 border-b border-slate-200 bg-white">{navegacao}</div>
      )}

      {dadosNovos && (
        <div role="status" className="shrink-0 px-3 sm:px-6 py-2 bg-blue-50 border-b border-blue-200 flex flex-wrap items-center justify-between gap-2 text-sm text-blue-900">
          <span>Há dados mais novos publicados. A tela mostra a cópia guardada neste aparelho.</span>
          <button
            onClick={() => window.location.reload()}
            className="h-10 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold cursor-pointer"
          >
            Atualizar agora
          </button>
        </div>
      )}

      {filters.tab !== 'minas' && (
        <TopSummaryBar
          candidatosSelecionados={itensDaTela}
          rotuloPartido={filters.somarFederacoes ? rotuloPartido : undefined}
          totalVotos={resumoGeral.votos}
          totalEleitores={resumoGeral.eleitores}
          pctSobreEleitores={resumoGeral.pct}
          porAno={resumoGeral.porAno}
          comparacao={resumoGeral.comparacao}
          votosSemLocalizacao={resumoGeral.votosSemLocal}
          acoes={navegacao}
          seguidores={seguidoresMarcados}
          onEscolher={() => setIsFilterDrawerOpenMobile(true)}
          fotoDe={fotoDaPessoa}
        />
      )}

      {avisosVisiveis.length > 0 && (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 sm:px-4 py-1 space-y-0.5 max-h-20 overflow-y-auto">
          {avisosVisiveis.map((a) => (
            <div key={a.chave} className={`flex items-start gap-2 text-xs ${a.erro ? 'text-rose-800' : 'text-amber-900'}`}>
              <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${a.erro ? 'text-rose-600' : 'text-amber-600'}`} />
              <span className="flex-1 leading-snug">{a.texto}</span>
              {a.erro && a.tentarDeNovo ? (
                <button
                  onClick={a.tentarDeNovo}
                  className="shrink-0 px-2.5 h-8 rounded-lg bg-white border border-rose-300 text-rose-800 font-semibold cursor-pointer"
                >
                  Tentar de novo
                </button>
              ) : (
                <button
                  onClick={() => setAvisosFechados((prev) => [...prev, a.chave])}
                  aria-label="Fechar aviso"
                  className="shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-amber-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden relative">
        {indice && filters.tab !== 'minas' && (
          <FilterDrawer
            redesDisponiveis={Array.from(new Set((perfisCarregados || []).filter((p) => !p.teste).flatMap((p) => p.redes.map((x) => x.rede))))}
            candidatosDisponiveis={indice.candidatos}
            filters={filters}
            onFilterChange={setFilters}
            onResetFilters={handleResetFilters}
            availableBairros={availableBairros}
            availableZonas={availableZonas}
            isOpenMobile={isFilterDrawerOpenMobile}
            onCloseMobile={() => setIsFilterDrawerOpenMobile(false)}
            parComparacao={parComparacao}
            itensForaDaSoma={Array.from(itensExcluidosDaSoma)}
            federacoes={federacoes}
            itensMarcados={visaoFederada ? itensDaTela : undefined}
          />
        )}

        <main className="flex-1 flex flex-col overflow-hidden relative isolate h-full w-full min-h-[400px]">
          {filters.tab === 'mapa' && (
            <>
            
            <VotingMap
              locais={locaisFiltrados}
              selectedLocalKey={selectedLocalKey}
              onSelectLocal={(key) => setSelectedLocalKey(key)}
              candidatosSelecionados={itensDaTela}
              modoVisualizacao={modoEfetivo}
              destaqueSecao={filters.secaoFiltro}
              hasAnyPublishedData={Boolean(indice?.candidatos && indice.candidatos.length > 0)}
            />
            </>
          )}

          {filters.tab === 'tabela' && (
            <SectionsTable
              locais={locaisFiltrados}
              candidatosSelecionados={itensDaTela}
              semLocalizacao={semLocalizacaoVisivel}
              itensForaDaSoma={Array.from(foraDaSoma)}
              onSelectLocal={(key) => {
                setSelectedLocalKey(key);
                setFilters({ ...filters, tab: 'mapa' });
              }}
              podeBaixar={podeEditar}
            />
          )}

          {filters.tab === 'minas' && <MinasView />}
        </main>

        {selectedLocal && filters.tab === 'mapa' && (
          <LocalDetailPanel
            local={selectedLocal}
            onClose={() => setSelectedLocalKey(null)}
            candidatosSelecionados={itensDaTela}
            podeBaixar={podeEditar}
          />
        )}
      </div>

      <OfflineIndicator />

      <AvisoDeCarga />
    </div>
  );
}
