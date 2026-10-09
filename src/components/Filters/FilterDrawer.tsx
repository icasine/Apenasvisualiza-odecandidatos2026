import React, { useState, useMemo, useEffect } from 'react';
import { Federacao, federacaoDoPartido } from '../../utils/perfis';
import { anosComFederacao, nomeCurtoDaFederacao, rotuloDaFederacao } from '../../utils/federacoes';
import {
  Users,
  ChevronDown,
  ChevronUp,
  Search,
  RotateCcw,
  SlidersHorizontal,
  X,
  Layers,
  PieChart,
  TrendingUp
} from 'lucide-react';
import {
  CandidatoInfo,
  CARGOS_DISPONIVEIS,
  FilterState,
  ModoVisualizacao,
  itemLigado
} from '../../types/election';
import { chaveDaPessoa, pessoaDoItem } from '../../utils/itens';

interface FilterDrawerProps {
  redesDisponiveis?: string[];
  candidatosDisponiveis: CandidatoInfo[];
  filters: FilterState;
  onFilterChange: (newFilters: FilterState) => void;
  onResetFilters: () => void;
  availableBairros: string[];
  availableZonas: string[];
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  parComparacao?: { de: string; para: string } | null;
  itensForaDaSoma?: string[];
  federacoes?: Federacao[] | null;
  itensMarcados?: CandidatoInfo[];
}

export const FilterDrawer: React.FC<FilterDrawerProps> = ({
  candidatosDisponiveis,
  filters,
  onFilterChange,
  onResetFilters,
  availableBairros,
  availableZonas,
  isOpenMobile,
  onCloseMobile,
  parComparacao = null,
  itensForaDaSoma = [],
  federacoes = null,
  itensMarcados
}) => {
  const [isMaisFiltrosOpen, setIsMaisFiltrosOpen] = useState(false);

  const toggleCandidato = (candidatoId: string) => {
    const exists = filters.candidatosSelecionados.includes(candidatoId);
    const newSelected = exists
      ? filters.candidatosSelecionados.filter((id) => id !== candidatoId)
      : [...filters.candidatosSelecionados, candidatoId];

    onFilterChange({
      ...filters,
      candidatosSelecionados: newSelected
    });
  };

  const selectAll = () => {
    onFilterChange({
      ...filters,
      candidatosSelecionados: Array.from(new Set([...filters.candidatosSelecionados, ...candidatosVisiveis.map((c) => c.id)]))
    });
  };

  const deselectAll = () => {
    onFilterChange({
      ...filters,
      candidatosSelecionados: []
    });
  };


  const { idsPorPessoa, chavePorId } = useMemo(() => {
    const porPessoa = new Map<string, string[]>();
    const porId = new Map<string, string>();
    for (const x of candidatosDisponiveis) {
      const k = chaveDaPessoa(x);
      porId.set(x.id, k);
      if (!k) continue;
      const lista = porPessoa.get(k);
      if (lista) lista.push(x.id); else porPessoa.set(k, [x.id]);
    }
    return { idsPorPessoa: porPessoa, chavePorId: porId };
  }, [candidatosDisponiveis]);
  const idsDaPessoa = (c: CandidatoInfo): string[] => {
    const k = chavePorId.get(c.id) ?? chaveDaPessoa(c);
    return k ? idsPorPessoa.get(k) || [] : [];
  };

  const [busca, setBusca] = useState('');
  const [recolhido, setRecolhido] = useState(false);
  const [buscaAplicada, setBuscaAplicada] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca), 300);
    return () => clearTimeout(t);
  }, [busca]);
  const [soMarcados, setSoMarcados] = useState(false);
  const desligadas = filters.eleicoesDesligadas || [];
  const anosDaLista = Array.from(new Set(candidatosDisponiveis.map((c) => String(c.ano)))).sort().reverse();
  const alternarEleicao = (chave: string) => {
    const ligada = !desligadas.includes(chave);
    const novas = ligada ? [...desligadas, chave] : desligadas.filter((d) => d !== chave);
    if (!novas.includes('proporcionais') || !novas.includes('majoritarias')) {
      if (anosDaLista.length === 0 || anosDaLista.some((a) => !novas.includes(`ano:${a}`))) {
        onFilterChange({ ...filters, eleicoesDesligadas: novas });
      }
    }
  };
  const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const termos = semAcento(buscaAplicada).split(/\s+/).filter(Boolean);
  const textoDeBusca = (c: CandidatoInfo) =>
    semAcento([c.nome, pessoaDoItem(c), c.numero, c.partido || '', CARGOS_DISPONIVEIS[c.cargo] || c.cargo, c.ano, c.tipo === 'legenda' ? 'legenda' : c.tipo === 'total_partido' ? 'total' : ''].join(' '));
  const textoPorId = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of candidatosDisponiveis) m.set(c.id, textoDeBusca(c));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidatosDisponiveis]);
  const selecionadosSet = useMemo(() => new Set(filters.candidatosSelecionados), [filters.candidatosSelecionados]);
  const candidatosVisiveis = candidatosDisponiveis.filter((c) => {
    if (!itemLigado(c, desligadas)) return false;
    if (soMarcados && !selecionadosSet.has(c.id)) return false;
    if (termos.length === 0) return true;
    const alvo = textoPorId.get(c.id) ?? textoDeBusca(c);
    return termos.every((t) => alvo.includes(t));
  });
  const filtrando = termos.length > 0 || soMarcados;

  const somarFederacoes = Boolean(filters.somarFederacoes);
  const federacaoDoItem = useMemo(() => {
    const lembradas = new Map<string, Federacao | null>();
    return (c: CandidatoInfo): Federacao | null => {
      if (!somarFederacoes || !federacoes || c.tipo === 'outros') return null;
      const k = `${c.ano}|${c.partido || ''}`;
      if (!lembradas.has(k)) lembradas.set(k, federacaoDoPartido(federacoes, c.partido, c.ano));
      return lembradas.get(k) || null;
    };
  }, [somarFederacoes, federacoes]);
  const anosLigados = anosDaLista.filter((a) => !desligadas.includes(`ano:${a}`)).sort();
  const anosDeFederacao = anosComFederacao(federacoes || [], anosLigados);

  const [gruposAbertos, setGruposAbertos] = useState<Record<string, boolean>>({});
  const gruposPorPartido = (grupo: string, cands: CandidatoInfo[], todosDoGrupo: CandidatoInfo[]) => {
    const rotuloDoPartido = (c: CandidatoInfo) => {
      if (c.tipo === 'outros') return 'Brancos, nulos e outros';
      const fed = federacaoDoItem(c);
      return fed ? rotuloDaFederacao(fed) : (c.partido || '').trim().toUpperCase() || 'Sem partido';
    };
    const mapa = new Map<string, CandidatoInfo[]>();
    cands.forEach((c) => {
      const partido = rotuloDoPartido(c);
      const lista = mapa.get(partido) || [];
      lista.push(c);
      mapa.set(partido, lista);
    });
    const agrupar = todosDoGrupo.length > 8 && new Set(todosDoGrupo.map(rotuloDoPartido)).size > 1;
    if (!agrupar) {
      return [{ chave: `${grupo}|todos`, partido: '', itens: cands, votos: 0, marcados: 0, aberto: true, comCabecalho: false }];
    }
    return Array.from(mapa.entries())
      .map(([partido, itens]) => {
        const chave = `${grupo}|${partido}`;
        const marcados = itens.filter((c) => filters.candidatosSelecionados.includes(c.id)).length;
        const ordem = (c: CandidatoInfo) => (c.tipo === 'total_partido' ? 0 : c.tipo === 'legenda' ? 1 : 2);
        const ordenados = [...itens].sort((x, y) => ordem(x) - ordem(y) || (y.totalVotos || 0) - (x.totalVotos || 0));
        const votos = itens.filter((c) => !c.tipo || c.tipo === 'candidato' || c.tipo === 'legenda').reduce((acc, c) => acc + (c.totalVotos || 0), 0);
        const aberto = gruposAbertos[chave] ?? (filtrando || marcados > 0);
        return { chave, partido, itens: ordenados, votos, marcados, aberto, comCabecalho: true };
      })
      .sort((x, y) => y.votos - x.votos || x.partido.localeCompare(y.partido, 'pt-BR'));
  };
  const marcarGrupo = (itens: CandidatoInfo[], marcar: boolean) => {
    const ids = new Set(itens.map((c) => c.id));
    onFilterChange({
      ...filters,
      candidatosSelecionados: marcar
        ? Array.from(new Set([...filters.candidatosSelecionados, ...itens.map((c) => c.id)]))
        : filters.candidatosSelecionados.filter((id) => !ids.has(id))
    });
  };
  const marcarEncontrados = () =>
    onFilterChange({ ...filters, candidatosSelecionados: Array.from(new Set([...filters.candidatosSelecionados, ...candidatosVisiveis.map((c) => c.id)])) });
  const desmarcarEncontrados = () => {
    const tirar = new Set(candidatosVisiveis.map((c) => c.id));
    onFilterChange({ ...filters, candidatosSelecionados: filters.candidatosSelecionados.filter((id) => !tirar.has(id)) });
  };
  const marcarPessoa = (c: CandidatoInfo) => {
    const ids = idsDaPessoa(c);
    onFilterChange({
      ...filters,
      candidatosSelecionados: Array.from(new Set([...filters.candidatosSelecionados, ...ids]))
    });
  };

  const marcados = itensMarcados || candidatosDisponiveis.filter((c) => filters.candidatosSelecionados.includes(c.id));
  const rotuloItem = (c: CandidatoInfo) => `${c.nome}${c.numero ? ` (${c.numero})` : ''} · ${CARGOS_DISPONIVEIS[c.cargo] || c.cargo} ${c.ano}`;

  const eleicoesPorChave = new Map<string, { chave: string; ano: string; cargo: CandidatoInfo['cargo'] }>();
  candidatosDisponiveis.forEach((c) => {
    const chave = `${c.ano}|${c.cargo}`;
    if (!eleicoesPorChave.has(chave)) eleicoesPorChave.set(chave, { chave, ano: c.ano, cargo: c.cargo });
  });
  const ordemDosCargos = Object.keys(CARGOS_DISPONIVEIS);
  const posicaoDoCargo = (cargo: string) => {
    const i = ordemDosCargos.indexOf(cargo);
    return i < 0 ? ordemDosCargos.length : i;
  };
  const eleicoes = Array.from(eleicoesPorChave.values()).sort(
    (x, y) => String(y.ano).localeCompare(String(x.ano)) || posicaoDoCargo(x.cargo) - posicaoDoCargo(y.cargo)
  );

  const content = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 text-slate-800 overflow-y-auto w-full select-none">
      
      <div className="p-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-xs z-10">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-600" />
          <h2 className="text-sm font-bold text-slate-900 tracking-wide">Candidatos & Filtros</h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onResetFilters}
            className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded transition cursor-pointer"
            title="Redefinir filtros"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Limpar</span>
          </button>
          <button
            onClick={onCloseMobile}
            className="lg:hidden flex items-center justify-center w-10 h-10 rounded-lg text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 cursor-pointer"
            aria-label="Fechar gaveta"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-5 text-xs">
        
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Candidatos Salvos ({candidatosDisponiveis.length})
            </span>
            {candidatosDisponiveis.length > 0 && candidatosVisiveis.length > 0 && (
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  onClick={filtrando ? marcarEncontrados : selectAll}
                  className="text-blue-600 hover:text-blue-700 transition cursor-pointer"
                >
                  {filtrando ? `Marcar os ${candidatosVisiveis.length}` : 'Marcar todos'}
                </button>
                <span className="text-slate-400">·</span>
                <button
                  onClick={filtrando ? desmarcarEncontrados : deselectAll}
                  className="text-slate-500 hover:text-slate-900 transition cursor-pointer"
                >
                  Desmarcar
                </button>
              </div>
            )}
          </div>

          {candidatosDisponiveis.length > 5 && (
            <div className="space-y-1.5">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  inputMode="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por nome, número, partido ou ano"
                  aria-label="Buscar candidato"
                  className="w-full h-10 pl-8 pr-9 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 select-text"
                />
                {busca && (
                  <button
                    type="button"
                    onClick={() => setBusca('')}
                    aria-label="Limpar a busca"
                    className="absolute right-0 top-0 w-10 h-10 flex items-center justify-center text-slate-500 hover:text-slate-900 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {filters.candidatosSelecionados.length === 0 && <div role="status" className="text-[12px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">Escolha um candidato na lista</div>}
              <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={soMarcados} onChange={(e) => setSoMarcados(e.target.checked)} className="rounded cursor-pointer" />
                  <span>Só os marcados ({filters.candidatosSelecionados.length})</span>
                </label>
                {filtrando && (
                  <span role="status" className="font-mono">
                    {candidatosVisiveis.length} de {candidatosDisponiveis.length}
                  </span>
                )}
              </div>
            </div>
          )}

          {candidatosDisponiveis.length === 0 ? (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-2">
              <p className="text-slate-500 text-xs">Nenhum candidato disponível.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {candidatosVisiveis.length === 0 && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center text-slate-600">
                  {soMarcados && termos.length === 0 ? 'Nenhum candidato marcado.' : 'Nenhum candidato encontrado com essa busca.'}
                </div>
              )}
              {eleicoes.map((e) => {
                  const doGrupo = (c: CandidatoInfo) => c.ano === e.ano && c.cargo === e.cargo;
                  const candsDoGrupo = candidatosVisiveis.filter(doGrupo);
                  if (candsDoGrupo.length === 0) return null;
                  const todosDoGrupo = candidatosDisponiveis.filter(doGrupo);
                  const totalDoGrupo = todosDoGrupo.length;
                  const marcadosDoGrupo = todosDoGrupo.filter((c) => filters.candidatosSelecionados.includes(c.id)).length;
                  const chaveEleicao = `eleicao|${e.chave}`;
                  const eleicaoAberta = gruposAbertos[chaveEleicao] ?? (filtrando || marcadosDoGrupo > 0 || eleicoes.length === 1);
                  return (
                    <div key={e.chave} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
                      <button
                        type="button"
                        onClick={() => setGruposAbertos((prev) => ({ ...prev, [chaveEleicao]: !eleicaoAberta }))}
                        aria-expanded={eleicaoAberta}
                        title={eleicaoAberta ? 'Recolher esta eleição' : 'Abrir esta eleição'}
                        className={`w-full min-h-10 flex items-center justify-between gap-2 text-left cursor-pointer ${eleicaoAberta ? 'pb-1.5 border-b border-slate-200' : ''}`}
                      >
                        <span className="min-w-0">
                          <span className="block font-bold text-slate-900 text-xs">
                            Eleição {e.ano} · {CARGOS_DISPONIVEIS[e.cargo] || e.cargo}
                          </span>
                          {marcadosDoGrupo > 0 && (
                            <span className="block text-[10px] text-blue-700 font-semibold">
                              {marcadosDoGrupo} {marcadosDoGrupo === 1 ? 'marcado' : 'marcados'}
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-1 shrink-0 text-[10px] text-slate-500 font-mono">
                          {filtrando && candsDoGrupo.length !== totalDoGrupo ? `${candsDoGrupo.length} de ${totalDoGrupo}` : `${totalDoGrupo} ${totalDoGrupo === 1 ? 'item' : 'itens'}`}
                          {eleicaoAberta ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </span>
                      </button>

                      <div className={eleicaoAberta ? 'space-y-1.5' : 'hidden'}>
                        {(eleicaoAberta ? gruposPorPartido(e.chave, candsDoGrupo, todosDoGrupo) : []).map((g) => (
                        <div key={g.chave} className="space-y-1.5">
                          {g.comCabecalho && (
                            <div className="flex items-center gap-2 h-10 pl-2 pr-1 bg-white border border-slate-300 rounded-lg">
                              <input
                                type="checkbox"
                                aria-label={`Marcar todos de ${g.partido} em ${e.ano}`}
                                checked={g.marcados === g.itens.length}
                                ref={(el) => {
                                  if (el) el.indeterminate = g.marcados > 0 && g.marcados < g.itens.length;
                                }}
                                onChange={() => marcarGrupo(g.itens, g.marcados !== g.itens.length)}
                                className="rounded cursor-pointer"
                              />
                              <button
                                type="button"
                                onClick={() => setGruposAbertos((prev) => ({ ...prev, [g.chave]: !g.aberto }))}
                                aria-expanded={g.aberto}
                                className="flex-1 min-w-0 flex items-center justify-between gap-2 h-full text-left cursor-pointer"
                              >
                                <span className="font-bold text-slate-900 text-xs truncate">
                                  {g.partido}{' '}
                                  <span className="font-normal text-slate-500">
                                    ({g.marcados > 0 ? `${g.marcados} de ${g.itens.length}` : g.itens.length})
                                  </span>
                                </span>
                                <span className="flex items-center gap-1 shrink-0 text-[10px] font-mono text-slate-600">
                                  {g.votos.toLocaleString('pt-BR')} votos
                                  {g.aberto ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </span>
                              </button>
                            </div>
                          )}
                          {g.aberto && g.itens.map((cand) => {
                        const isChecked = filters.candidatosSelecionados.includes(cand.id);
                        return (
                          <label
                            key={cand.id}
                            className={`flex items-start gap-2.5 p-2 rounded-lg border transition cursor-pointer ${
                              isChecked
                                ? 'bg-slate-100 border-blue-500/50 text-slate-900'
                                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleCandidato(cand.id)}
                              className="mt-0.5 rounded text-blue-600 focus:ring-0 cursor-pointer"
                            />

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: cand.cor }}
                                />
                                <span className="font-semibold text-xs truncate leading-snug">
                                  {cand.nome}
                                </span>
                                {cand.tipo && cand.tipo !== 'candidato' && (
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                      cand.tipo === 'total_partido'
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : cand.tipo === 'legenda'
                                        ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                        : 'bg-slate-100 text-slate-700 border border-slate-300'
                                    }`}
                                  >
                                    {cand.tipo === 'total_partido'
                                      ? `Total ${cand.partido || ''}`.trim()
                                      : cand.tipo === 'legenda'
                                      ? `Legenda ${cand.partido || ''}`.trim()
                                      : 'Outros'}
                                  </span>
                                )}
                                {(!cand.tipo || cand.tipo === 'candidato') && cand.partido && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200 font-mono">
                                    {cand.partido}
                                  </span>
                                )}
                                {federacaoDoItem(cand) && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                    {nomeCurtoDaFederacao(federacaoDoItem(cand)!)}
                                  </span>
                                )}
                                {isChecked && itensForaDaSoma.includes(cand.id) && (
                                  <span
                                    className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200"
                                    title="O total do partido marcado já inclui estes votos; eles não são somados de novo"
                                  >
                                    Fora da soma
                                  </span>
                                )}
                                {cand.temDuplicados && (
                                  <span
                                    className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-200"
                                    title="Possui seções duplicadas que podem ser resolvidas em Gestão de Dados"
                                  >
                                    ⚠️ Duplicados
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-500 mt-1 flex items-center justify-between">
                                <span>
                                  {cand.numero ? (
                                    <>
                                      Nº <strong className="font-mono text-slate-800">{cand.numero}</strong> ·{' '}
                                    </>
                                  ) : null}
                                  {CARGOS_DISPONIVEIS[cand.cargo] || cand.cargo}
                                </span>
                                {cand.totalVotos !== undefined && (
                                  <span className="font-mono text-blue-600 font-semibold">
                                    {cand.totalVotos.toLocaleString('pt-BR')} votos
                                  </span>
                                )}
                              </div>
                              {idsDaPessoa(cand).length > 1 && (
                                <div className="text-[10px] text-slate-500 mt-1 flex items-center justify-between gap-2">
                                  <span className="truncate">Pessoa: {pessoaDoItem(cand)}</span>
                                  {idsDaPessoa(cand).some((id) => !filters.candidatosSelecionados.includes(id)) && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        marcarPessoa(cand);
                                      }}
                                      className="shrink-0 text-blue-700 font-semibold underline cursor-pointer"
                                    >
                                      marcar as {idsDaPessoa(cand).length} eleições
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </label>
                        );
                      })}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {filters.candidatosSelecionados.length > 1 && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-blue-800 uppercase tracking-wider block">Como mostrar no mapa</label>
              <div className="grid grid-cols-3 gap-1 bg-white p-1 rounded-lg border border-slate-200">
                {[
                  { modo: 'somar' as ModoVisualizacao, rotulo: 'Somar', icone: <Layers className="w-3.5 h-3.5" /> },
                  { modo: 'lado_a_lado' as ModoVisualizacao, rotulo: 'Lado a lado', icone: <PieChart className="w-3.5 h-3.5" /> },
                  { modo: 'diferenca' as ModoVisualizacao, rotulo: 'Diferença', icone: <TrendingUp className="w-3.5 h-3.5" /> }
                ].map((op) => {
                  const desligado = op.modo === 'diferenca' && !parComparacao;
                  const ativo = filters.modoVisualizacao === op.modo && !desligado;
                  return (
                    <button
                      key={op.modo}
                      disabled={desligado}
                      onClick={() => onFilterChange({ ...filters, modoVisualizacao: op.modo })}
                      className={`h-10 px-1 text-center rounded-md font-semibold text-[11px] transition flex items-center justify-center gap-1 ${
                        ativo ? 'bg-blue-600 text-white shadow-xs' : desligado ? 'text-slate-400' : 'text-slate-600 hover:text-slate-900 cursor-pointer'
                      }`}
                    >
                      {op.icone}
                      <span>{op.rotulo}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-600">
                {filters.modoVisualizacao === 'somar' || (filters.modoVisualizacao === 'diferenca' && !parComparacao)
                  ? 'O ponto de cada escola mostra a soma dos itens marcados.'
                  : filters.modoVisualizacao === 'lado_a_lado'
                  ? 'Cada ponto mostra a fatia de cada item, com a cor dele.'
                  : 'Azul onde a votação cresceu, laranja onde caiu. O tamanho do ponto é o tamanho da diferença.'}
              </p>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-blue-200">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] font-bold text-blue-800 uppercase tracking-wider">Comparar duas eleições</label>
                {parComparacao && (
                  <button
                    type="button"
                    onClick={() =>
                      onFilterChange({
                        ...filters,
                        compararDe: 'nenhum',
                        compararPara: '',
                        modoVisualizacao: filters.modoVisualizacao === 'diferenca' ? 'somar' : filters.modoVisualizacao
                      })
                    }
                    className="text-[10px] text-slate-600 underline cursor-pointer"
                  >
                    não comparar
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                <label className="flex items-center gap-2 text-[11px] text-slate-700">
                  <span className="w-8 shrink-0 font-semibold">De</span>
                  <select
                    value={parComparacao?.de || ''}
                    onChange={(e) => {
                      const de = e.target.value;
                      const para = parComparacao?.para && parComparacao.para !== de ? parComparacao.para : marcados.find((m) => m.id !== de)?.id || '';
                      onFilterChange({ ...filters, compararDe: de, compararPara: para });
                    }}
                    className="flex-1 min-w-0 h-9 bg-white border border-slate-300 rounded-lg px-1.5 text-[11px] text-slate-900"
                  >
                    <option value="">Escolher…</option>
                    {marcados.map((m) => (
                      <option key={m.id} value={m.id}>
                        {rotuloItem(m)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-[11px] text-slate-700">
                  <span className="w-8 shrink-0 font-semibold">Para</span>
                  <select
                    value={parComparacao?.para || ''}
                    onChange={(e) => {
                      const para = e.target.value;
                      const de = parComparacao?.de && parComparacao.de !== para ? parComparacao.de : marcados.find((m) => m.id !== para)?.id || '';
                      onFilterChange({ ...filters, compararDe: de, compararPara: para });
                    }}
                    className="flex-1 min-w-0 h-9 bg-white border border-slate-300 rounded-lg px-1.5 text-[11px] text-slate-900"
                  >
                    <option value="">Escolher…</option>
                    {marcados.map((m) => (
                      <option key={m.id} value={m.id}>
                        {rotuloItem(m)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="text-[10px] text-slate-600">
                {parComparacao
                  ? 'A diferença aparece no resumo do topo, ao tocar em uma escola e na tabela.'
                  : 'Escolha dois itens marcados. Candidaturas da mesma pessoa em anos diferentes são sugeridas sozinhas.'}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Zonas Eleitorais
            </label>
            {filters.zonas.length > 0 && (
              <button
                onClick={() => onFilterChange({ ...filters, zonas: [] })}
                className="text-[10px] text-blue-600 hover:text-blue-700 font-semibold transition cursor-pointer"
              >
                Todas as zonas
              </button>
            )}
          </div>
          {availableZonas.length === 0 ? (
            <div className="text-[11px] text-slate-500 italic p-2 bg-slate-50 border border-slate-200 rounded-lg">
              Nenhuma zona encontrada nos arquivos carregados.
            </div>
          ) : (
            <div className="space-y-0.5">
              {availableZonas.map((zona) => {
                const ligada = filters.zonas.length === 0 || filters.zonas.includes(zona);
                const alternar = () => {
                  const atuais = filters.zonas.length === 0 ? [...availableZonas] : [...filters.zonas];
                  const novas = ligada ? atuais.filter((z) => z !== zona) : [...atuais, zona];
                  if (novas.length === 0) return;
                  onFilterChange({ ...filters, zonas: novas.length === availableZonas.length ? [] : novas });
                };
                return (
                  <button
                    key={zona}
                    type="button"
                    role="switch"
                    aria-checked={ligada}
                    onClick={alternar}
                    className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-xs cursor-pointer hover:bg-slate-50"
                  >
                    <span className={ligada ? 'text-slate-800 font-medium' : 'text-slate-400'}>Zona {zona}</span>
                    <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition ${ligada ? 'bg-blue-600' : 'bg-slate-300'}`}>
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${ligada ? 'left-4' : 'left-0.5'}`} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setIsMaisFiltrosOpen(!isMaisFiltrosOpen)}
            className="w-full p-3 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-left transition cursor-pointer"
          >
            <span className="font-bold text-xs text-slate-700 flex items-center gap-2">
              <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600" />
              <span>Mais Filtros</span>
              {(filters.bairro || filters.buscaLocal || filters.secaoFiltro || filters.faixaMinVotos !== null) && (
                <span className="w-2 h-2 rounded-full bg-blue-500" />
              )}
            </span>
            {isMaisFiltrosOpen ? (
              <ChevronUp className="w-4 h-4 text-slate-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-500" />
            )}
          </button>

          {isMaisFiltrosOpen && (
            <div className="p-3 bg-white space-y-3 border-t border-slate-200">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                  Bairro
                </label>
                <select
                  value={filters.bairro}
                  onChange={(e) => onFilterChange({ ...filters, bairro: e.target.value })}
                  className="w-full bg-slate-100 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Todos os Bairros</option>
                  {availableBairros.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                  Buscar Local / Escola
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Nome da escola, local ou endereço..."
                    value={filters.buscaLocal}
                    onChange={(e) => onFilterChange({ ...filters, buscaLocal: e.target.value })}
                    className="w-full bg-slate-100 border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                  Localizar Seção Específica
                </label>
                <input
                  type="text"
                  placeholder="Ex: 0015"
                  value={filters.secaoFiltro}
                  onChange={(e) => onFilterChange({ ...filters, secaoFiltro: e.target.value })}
                  className="w-full bg-slate-100 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 placeholder-slate-400 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                  Faixa Mínima de Votos no Local
                </label>
                <input
                  type="number"
                  placeholder="Mínimo de votos..."
                  value={filters.faixaMinVotos ?? ''}
                  onChange={(e) =>
                    onFilterChange({
                      ...filters,
                      faixaMinVotos: e.target.value ? Number(e.target.value) : null
                    })
                  }
                  className="w-full bg-slate-100 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-mono"
                />
              </div>
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Eleições</span>
          {[
            { chave: 'proporcionais', rotulo: 'Proporcionais (vereador e deputados)' },
            { chave: 'majoritarias', rotulo: 'Majoritárias (prefeito)' },
            ...anosDaLista.map((a) => ({ chave: `ano:${a}`, rotulo: `Eleição ${a}` }))
          ].map(({ chave, rotulo }) => {
            const ligada = !desligadas.includes(chave);
            return (
              <button
                key={chave}
                type="button"
                role="switch"
                aria-checked={ligada}
                onClick={() => alternarEleicao(chave)}
                className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-xs cursor-pointer hover:bg-slate-50 ${chave.startsWith('ano:') ? 'pl-4' : ''}`}
              >
                <span className={ligada ? 'text-slate-800 font-medium' : 'text-slate-400'}>{rotulo}</span>
                <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition ${ligada ? 'bg-blue-600' : 'bg-slate-300'}`}>
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${ligada ? 'left-4' : 'left-0.5'}`} />
                </span>
              </button>
            );
          })}
        </div>
        <div className="space-y-1.5">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Federações de partidos</span>
          <button
            type="button"
            role="switch"
            aria-checked={somarFederacoes}
            onClick={() => onFilterChange({ ...filters, somarFederacoes: !somarFederacoes })}
            className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-xs cursor-pointer hover:bg-slate-50"
          >
            <span className={somarFederacoes ? 'text-slate-800 font-medium' : 'text-slate-400'}>Somar federações</span>
            <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition ${somarFederacoes ? 'bg-blue-600' : 'bg-slate-300'}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${somarFederacoes ? 'left-4' : 'left-0.5'}`} />
            </span>
          </button>
          <p className="px-2 text-[10px] text-slate-600">
            {!somarFederacoes
              ? 'Ligado, os partidos de uma mesma federação passam a contar juntos, para ver a força do grupo nos bairros e nas urnas.'
              : !federacoes
              ? 'Lendo a lista de federações...'
              : anosDeFederacao.length === 0
              ? `Nenhuma federação vale nas eleições ligadas (${anosLigados.join(', ') || 'nenhuma'}). Nesses anos o interruptor não muda nada.`
              : `Vale em ${anosDeFederacao.join(', ')}${anosLigados.length > anosDeFederacao.length ? ` (em ${anosLigados.filter((a) => !anosDeFederacao.includes(a)).join(', ')} não havia federação)` : ''}. Na lista, os partidos da federação ficam juntos e uma caixa marca todos de uma vez. Marcados juntos, os itens de total ou de legenda desses partidos viram um item só no mapa e na tabela. Os votos de cada candidato não mudam e não há cálculo de cadeiras.`}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {recolhido ? (
        <aside className="hidden lg:flex w-10 h-full shrink-0 border-r border-slate-200 bg-white flex-col items-center pt-3">
          <button type="button" onClick={() => setRecolhido(false)} title="Mostrar candidatos e filtros" aria-label="Mostrar candidatos e filtros" className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer">›</button>
          <span className="mt-3 text-[11px] font-semibold text-slate-500 [writing-mode:vertical-rl] rotate-180">Candidatos e filtros</span>
        </aside>
      ) : (
        <aside className="hidden lg:block relative w-80 h-full shrink-0 shadow-lg">
          <button type="button" onClick={() => setRecolhido(true)} title="Recolher o painel" aria-label="Recolher o painel" className="absolute top-1/2 -translate-y-1/2 -right-5 z-[1100] w-5 h-14 flex items-center justify-center rounded-r-lg border border-l-0 border-slate-300 shadow bg-white text-slate-700 hover:bg-slate-50 cursor-pointer">‹</button>
          {content}
        </aside>
      )}

      {isOpenMobile && (
        <div className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative bg-white border-t border-slate-200 rounded-t-2xl max-h-[85vh] h-[85vh] flex flex-col z-10 shadow-2xl overflow-hidden">
            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto my-2.5 shrink-0" />
            <div className="flex-1 overflow-y-auto">{content}</div>
          </div>
        </div>
      )}
    </>
  );
};
