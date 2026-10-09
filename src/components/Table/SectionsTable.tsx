import React, { useEffect, useMemo, useState } from 'react';
import { hojeIso } from '../../utils/perfis';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  MapPin,
  Search,
  ShieldCheck,
  Table as TableIcon,
  Trophy
} from 'lucide-react';
import { CandidatoInfo, LocalAgrupado, SecaoVisualizacao } from '../../types/election';
import { VotoSemLocalizacao } from '../../utils/consolidacao';
import { exportTabelaToPDF, LinhaTabelaPDF } from '../../utils/pdfExport';

interface SectionsTableProps {
  locais: LocalAgrupado[];
  candidatosSelecionados: CandidatoInfo[];
  semLocalizacao?: VotoSemLocalizacao[];
  itensForaDaSoma?: string[];
  onSelectLocal: (localKey: string) => void;
  podeBaixar?: boolean;
}

type SubSecaoTab = 'dados' | 'ranking' | 'conferencia';
type Nivel = 'escola' | 'secao' | 'bairro' | 'zona';

const NOMES_NIVEL: Record<Nivel, string> = {
  escola: 'Por escola',
  secao: 'Por seção',
  bairro: 'Por bairro',
  zona: 'Por zona'
};

interface Linha {
  chave: string;
  titulo: string;
  subtitulo: string;
  zona: string;
  busca: string;
  eleitores: Record<string, number | null>;
  votos: Record<string, number | null>;
  total: number;
  diferenca: number | null | undefined;
  localKey?: string;
  secoes?: SecaoVisualizacao[];
  observacao?: string;
}

const numero = (n: number): string => n.toLocaleString('pt-BR');
const pctTexto = (n: number | null): string => (n === null ? '-' : `${n.toFixed(1).replace('.', ',')}%`);
const comSinal = (n: number): string => `${n > 0 ? '+' : ''}${n.toLocaleString('pt-BR')}`;
const corSegura = (cor: unknown): string => (typeof cor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(cor) ? cor : '#2563eb');

export const SectionsTable: React.FC<SectionsTableProps> = ({
  locais,
  candidatosSelecionados,
  semLocalizacao = [],
  itensForaDaSoma = [],
  onSelectLocal,
  podeBaixar = false
}) => {
  const [subTab, setSubTab] = useState<SubSecaoTab>('dados');
  const [nivel, setNivel] = useState<Nivel>('escola');
  const [busca, setBusca] = useState('');
  const [zonasMarcadas, setZonasMarcadas] = useState<string[]>([]);
  const [minimoVotos, setMinimoVotos] = useState<string>('');
  const [ordem, setOrdem] = useState<{ campo: string; crescente: boolean }>({ campo: 'total', crescente: false });
  const [abertas, setAbertas] = useState<string[]>([]);

  const anos = useMemo(() => {
    const dosItens = Array.from(new Set(candidatosSelecionados.map((c) => c.ano))).sort();
    if (dosItens.length > 0) return dosItens;
    return Array.from(new Set(locais.flatMap((l) => l.anosPresentes || []))).sort();
  }, [candidatosSelecionados, locais]);
  const variosAnos = anos.length > 1;
  const temComparacao = locais.some((l) => l.comparacao);
  const somaveis = useMemo(() => candidatosSelecionados.filter((c) => !itensForaDaSoma.includes(c.id)), [candidatosSelecionados, itensForaDaSoma]);

  useEffect(() => {
    setOrdem(nivel === 'secao' ? { campo: 'titulo', crescente: true } : { campo: 'total', crescente: false });
    setAbertas([]);
  }, [nivel]);

  const zonasDisponiveis = useMemo(
    () => Array.from(new Set<string>(locais.map((l) => l.zona))).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b)),
    [locais]
  );

  const eleitoresDaEscola = (loc: LocalAgrupado, ano: string): number | null => {
    if (loc.eleitoresPorAno && loc.eleitoresPorAno[ano] !== undefined) return loc.eleitoresPorAno[ano];
    return variosAnos ? null : loc.totalEleitoresAptos;
  };

  const linhas = useMemo<Linha[]>(() => {
    const daEscola = (loc: LocalAgrupado): Linha => {
      const eleitores: Record<string, number | null> = {};
      anos.forEach((a) => (eleitores[a] = eleitoresDaEscola(loc, a)));
      const votos: Record<string, number | null> = {};
      candidatosSelecionados.forEach((c) => {
        votos[c.id] = (loc.semCorrespondencia || []).includes(c.id) ? null : loc.votosPorCandidato[c.id] || 0;
      });
      return {
        chave: loc.key,
        titulo: loc.nome_local,
        subtitulo: `Zona ${loc.zona} · Local ${loc.local_num} · ${loc.bairro}`,
        zona: loc.zona,
        busca: `${loc.nome_local} ${loc.bairro} ${loc.zona} ${loc.local_num} ${loc.secoes.map((s) => s.secao).join(' ')}`.toLowerCase(),
        eleitores,
        votos,
        total: loc.totalVotosMarcados,
        diferenca: loc.comparacao ? loc.comparacao.diferencaVotos : temComparacao ? null : undefined,
        localKey: loc.key,
        secoes: loc.secoes
      };
    };

    if (nivel === 'escola') return locais.map(daEscola);

    if (nivel === 'secao') {
      const lista: Linha[] = [];
      locais.forEach((loc) => {
        loc.secoes.forEach((sec) => {
          const eleitores: Record<string, number | null> = {};
          anos.forEach((a) => {
            if (sec.aptosPorAno && sec.aptosPorAno[a] !== undefined) eleitores[a] = sec.aptosPorAno[a];
            else eleitores[a] = variosAnos ? null : sec.aptos;
          });
          const votos: Record<string, number | null> = {};
          candidatosSelecionados.forEach((c) => {
            const v = sec.votosPorCandidato[c.id];
            votos[c.id] = sec.isAgregada || v === undefined ? null : v;
          });
          let dif: number | null | undefined = temComparacao ? null : undefined;
          if (loc.comparacao) {
            const a = votos[loc.comparacao.deId];
            const b = votos[loc.comparacao.paraId];
            dif = a !== null && a !== undefined && b !== null && b !== undefined ? b - a : null;
          }
          lista.push({
            chave: `${loc.key}|${sec.zona}_${sec.secao}`,
            titulo: `Zona ${sec.zona} · Seção ${sec.secao}`,
            subtitulo: `${loc.nome_local} · ${loc.bairro}`,
            zona: sec.zona,
            busca: `${sec.secao} ${sec.zona} ${loc.nome_local} ${loc.bairro}`.toLowerCase(),
            eleitores,
            votos,
            total: sec.isAgregada ? 0 : sec.votosTotalMarcados,
            diferenca: dif,
            localKey: loc.key,
            observacao: sec.isAgregada ? `Agregada à seção ${sec.secaoDestino || 'principal'}` : undefined
          });
        });
      });
      return lista;
    }

    const grupos = new Map<string, { linha: Linha; escolas: number }>();
    locais.forEach((loc) => {
      const chave = nivel === 'bairro' ? loc.bairro || 'Não informado' : loc.zona;
      const e = daEscola(loc);
      let g = grupos.get(chave);
      if (!g) {
        g = {
          escolas: 0,
          linha: {
            chave,
            titulo: nivel === 'bairro' ? chave : `Zona ${chave}`,
            subtitulo: '',
            zona: nivel === 'zona' ? chave : loc.zona,
            busca: chave.toLowerCase(),
            eleitores: {},
            votos: {},
            total: 0,
            diferenca: temComparacao ? null : undefined
          }
        };
        grupos.set(chave, g);
      }
      g.escolas++;
      anos.forEach((a) => {
        if (e.eleitores[a] !== null) g!.linha.eleitores[a] = (g!.linha.eleitores[a] || 0) + (e.eleitores[a] as number);
        else if (g!.linha.eleitores[a] === undefined) g!.linha.eleitores[a] = null;
      });
      candidatosSelecionados.forEach((c) => {
        if (e.votos[c.id] !== null) g!.linha.votos[c.id] = (g!.linha.votos[c.id] || 0) + (e.votos[c.id] as number);
        else if (g!.linha.votos[c.id] === undefined) g!.linha.votos[c.id] = null;
      });
      g.linha.total += e.total;
      if (e.diferenca !== null && e.diferenca !== undefined) g.linha.diferenca = (g.linha.diferenca || 0) + e.diferenca;
      if (nivel === 'bairro' && !g.linha.busca.includes(loc.zona)) g.linha.busca += ` ${loc.zona}`;
    });
    return Array.from(grupos.values()).map((g) => ({
      ...g.linha,
      subtitulo: `${g.escolas} ${g.escolas === 1 ? 'escola' : 'escolas'}`
    }));
  }, [locais, nivel, anos, candidatosSelecionados, temComparacao, variosAnos]);

  const pctDoItem = (l: Linha, c: CandidatoInfo): number | null => {
    const v = l.votos[c.id];
    const e = l.eleitores[c.ano];
    if (v === null || v === undefined || e === null || e === undefined || e <= 0) return null;
    return (v / e) * 100;
  };

  const linhasVisiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const minimo = minimoVotos.trim() ? Number(minimoVotos) : null;
    const filtradas = linhas.filter((l) => {
      if (termo && !l.busca.includes(termo)) return false;
      if (zonasMarcadas.length > 0 && nivel !== 'bairro' && !zonasMarcadas.includes(l.zona)) return false;
      if (minimo !== null && !isNaN(minimo) && l.total < minimo) return false;
      return true;
    });

    const valor = (l: Linha): number | string | null => {
      const { campo } = ordem;
      if (campo === 'titulo') return l.titulo;
      if (campo === 'total') return l.total;
      if (campo === 'diferenca') return l.diferenca ?? null;
      if (campo.startsWith('eleitores_')) return l.eleitores[campo.slice(10)] ?? null;
      if (campo.startsWith('votos_')) return l.votos[campo.slice(6)] ?? null;
      if (campo.startsWith('pct_')) {
        const c = candidatosSelecionados.find((x) => x.id === campo.slice(4));
        return c ? pctDoItem(l, c) : null;
      }
      return null;
    };

    return [...filtradas].sort((a, b) => {
      const va = valor(a);
      const vb = valor(b);
      if (va === null && vb === null) return a.titulo.localeCompare(b.titulo, 'pt-BR', { numeric: true });
      if (va === null) return 1;
      if (vb === null) return -1;
      const comparacao =
        typeof va === 'string' || typeof vb === 'string'
          ? String(va).localeCompare(String(vb), 'pt-BR', { numeric: true })
          : (va as number) - (vb as number);
      if (comparacao !== 0) return ordem.crescente ? comparacao : -comparacao;
      return a.titulo.localeCompare(b.titulo, 'pt-BR', { numeric: true });
    });
  }, [linhas, busca, zonasMarcadas, minimoVotos, ordem, nivel, candidatosSelecionados]);

  const totais = useMemo(() => {
    const eleitores: Record<string, number> = {};
    const votos: Record<string, number> = {};
    let total = 0;
    let diferenca = 0;
    linhasVisiveis.forEach((l) => {
      anos.forEach((a) => (eleitores[a] = (eleitores[a] || 0) + (l.eleitores[a] || 0)));
      candidatosSelecionados.forEach((c) => (votos[c.id] = (votos[c.id] || 0) + (l.votos[c.id] || 0)));
      total += l.total;
      diferenca += l.diferenca || 0;
    });
    return { eleitores, votos, total, diferenca };
  }, [linhasVisiveis, anos, candidatosSelecionados]);

  const mudarOrdem = (campo: string) => {
    setOrdem((atual) => (atual.campo === campo ? { campo, crescente: !atual.crescente } : { campo, crescente: campo === 'titulo' }));
  };
  const seta = (campo: string) => (ordem.campo === campo ? (ordem.crescente ? ' ▲' : ' ▼') : '');

  const alternarAberta = (chave: string) =>
    setAbertas((atual) => (atual.includes(chave) ? atual.filter((c) => c !== chave) : [...atual, chave]));

  const rotuloItem = (c: CandidatoInfo) => `${c.nome}${c.numero ? ` ${c.numero}` : ''}${variosAnos ? ` ${c.ano}` : ''}`;
  const colunasExportacao = () => {
    const cols: Array<{ titulo: string; alinhar?: 'left' | 'right'; peso?: number }> = [
      { titulo: nivel === 'secao' ? 'Zona e seção' : nivel === 'escola' ? 'Escola' : nivel === 'bairro' ? 'Bairro' : 'Zona', peso: 3.2 },
      { titulo: nivel === 'bairro' || nivel === 'zona' ? 'Escolas' : nivel === 'secao' ? 'Escola e bairro' : 'Zona, local e bairro', peso: 2.6 }
    ];
    anos.forEach((a) => cols.push({ titulo: variosAnos ? `Eleitores ${a}` : 'Eleitores', alinhar: 'right', peso: 1 }));
    candidatosSelecionados.forEach((c) => {
      cols.push({ titulo: `${rotuloItem(c)} (votos)`, alinhar: 'right', peso: 1.25 });
      cols.push({ titulo: '%', alinhar: 'right', peso: 0.7 });
    });
    if (somaveis.length > 1) cols.push({ titulo: 'Total', alinhar: 'right', peso: 1 });
    if (temComparacao) cols.push({ titulo: 'Diferença', alinhar: 'right', peso: 1 });
    return cols;
  };
  const celulasDaLinha = (l: Linha): string[] => {
    const cel: string[] = [l.titulo, l.observacao ? `${l.subtitulo} (${l.observacao})` : l.subtitulo];
    anos.forEach((a) => cel.push(l.eleitores[a] === null || l.eleitores[a] === undefined ? '-' : numero(l.eleitores[a] as number)));
    candidatosSelecionados.forEach((c) => {
      const v = l.votos[c.id];
      cel.push(v === null || v === undefined ? (l.observacao ? '-' : 'sem correspondência') : numero(v));
      cel.push(pctTexto(pctDoItem(l, c)));
    });
    if (somaveis.length > 1) cel.push(numero(l.total));
    if (temComparacao) cel.push(l.diferenca === null || l.diferenca === undefined ? '-' : comSinal(l.diferenca));
    return cel;
  };
  const celulasDaSecao = (loc: Linha, sec: SecaoVisualizacao): string[] => {
    const cel: string[] = [`Seção ${sec.secao}`, sec.isAgregada ? `Agregada à seção ${sec.secaoDestino || 'principal'}` : ''];
    anos.forEach((a) => {
      const e = sec.aptosPorAno && sec.aptosPorAno[a] !== undefined ? sec.aptosPorAno[a] : variosAnos ? null : sec.aptos;
      cel.push(e === null ? '-' : numero(e));
    });
    candidatosSelecionados.forEach((c) => {
      const v = sec.votosPorCandidato[c.id];
      const e = sec.aptosPorAno && sec.aptosPorAno[c.ano] !== undefined ? sec.aptosPorAno[c.ano] : sec.aptos;
      cel.push(sec.isAgregada || v === undefined ? '-' : numero(v));
      cel.push(sec.isAgregada || v === undefined || !e ? '-' : pctTexto((v / e) * 100));
    });
    if (somaveis.length > 1) cel.push(sec.isAgregada ? '-' : numero(sec.votosTotalMarcados));
    if (temComparacao) cel.push('');
    return cel;
  };
  const celulasDosTotais = (): string[] => {
    const cel: string[] = [`Total (${numero(linhasVisiveis.length)} ${linhasVisiveis.length === 1 ? 'linha' : 'linhas'})`, ''];
    anos.forEach((a) => cel.push(numero(totais.eleitores[a] || 0)));
    candidatosSelecionados.forEach((c) => {
      const v = totais.votos[c.id] || 0;
      const e = totais.eleitores[c.ano] || 0;
      cel.push(numero(v));
      cel.push(e > 0 ? pctTexto((v / e) * 100) : '-');
    });
    if (somaveis.length > 1) cel.push(numero(totais.total));
    if (temComparacao) cel.push(comSinal(totais.diferenca));
    return cel;
  };
  const linhasParaExportar = (): LinhaTabelaPDF[] => {
    const saida: LinhaTabelaPDF[] = [];
    linhasVisiveis.forEach((l) => {
      saida.push({ celulas: celulasDaLinha(l) });
      if (nivel === 'escola' && abertas.includes(l.chave) && l.secoes) {
        [...l.secoes]
          .sort((a, b) => a.secao.localeCompare(b.secao))
          .forEach((sec) => saida.push({ celulas: celulasDaSecao(l, sec), recuo: true }));
      }
    });
    saida.push({ celulas: celulasDosTotais(), destaque: true });
    return saida;
  };
  const descricaoDosFiltros = (): string => {
    const partes = [NOMES_NIVEL[nivel]];
    if (busca.trim()) partes.push(`busca "${busca.trim()}"`);
    if (zonasMarcadas.length > 0) partes.push(`zonas ${zonasMarcadas.join(', ')}`);
    if (minimoVotos.trim()) partes.push(`a partir de ${minimoVotos} votos`);
    return partes.join(' · ');
  };
  const dataDeHoje = () => hojeIso();

  const baixarCSV = () => {
    const semMilhar = (t: string) => (/^[+-]?\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t);
    const aspas = (t: string) => `"${semMilhar(String(t)).replace(/"/g, '""')}"`;
    const cabecalho = colunasExportacao().map((c) => aspas(c.titulo)).join(';');
    const corpo = linhasParaExportar().map((l) => l.celulas.map((c) => aspas(c)).join(';'));
    const csv = '﻿' + [cabecalho, ...corpo].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contagem_${nivel}_${dataDeHoje()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportarPDF = () => {
    const observacoes = ['Percentuais calculados sobre os eleitores aptos do ano de cada item.'];
    if (semLocalizacao.length > 0) {
      observacoes.push(
        `Fora desta tabela: ${numero(semLocalizacao.reduce((a, v) => a + v.votos, 0))} votos em ${semLocalizacao.length} seções que não estão no cadastro de locais.`
      );
    }
    exportTabelaToPDF({
      titulo: 'MAPA ELEITORAL DE CONTAGEM / MG',
      subtitulo: `${candidatosSelecionados.map(rotuloItem).join(', ') || 'Nenhum item marcado'} · ${descricaoDosFiltros()}`,
      colunas: colunasExportacao(),
      linhas: linhasParaExportar(),
      observacoes,
      nomeArquivo: `contagem_${nivel}_${dataDeHoje()}.pdf`
    });
  };

  const rankingLocais = useMemo(() => [...locais].sort((a, b) => b.totalVotosMarcados - a.totalVotosMarcados), [locais]);
  const maxVotosRanking = rankingLocais.length > 0 ? Math.max(rankingLocais[0].totalVotosMarcados, 1) : 1;
  const todasSecoes = useMemo(() => locais.flatMap((l) => l.secoes), [locais]);
  const secoesAgregadas = useMemo(() => todasSecoes.filter((s) => s.isAgregada), [todasSecoes]);
  const secoesSemCoordenadas = useMemo(() => todasSecoes.filter((s) => s.latitude === null || s.longitude === null), [todasSecoes]);
  const escolasSemCorrespondencia = useMemo(() => locais.filter((l) => (l.semCorrespondencia || []).length > 0), [locais]);
  const nomeDoItem = (id: string) => {
    const c = candidatosSelecionados.find((x) => x.id === id);
    return c ? rotuloItem(c) : id;
  };
  const pendenciasConferencia = semLocalizacao.length + escolasSemCorrespondencia.length;

  const opcoesDeOrdem: Array<{ campo: string; rotulo: string }> = [
    { campo: 'total', rotulo: 'Mais votos' },
    { campo: 'titulo', rotulo: 'Nome' },
    ...anos.map((a) => ({ campo: `eleitores_${a}`, rotulo: variosAnos ? `Eleitores ${a}` : 'Eleitores' })),
    ...candidatosSelecionados.flatMap((c) => [
      { campo: `votos_${c.id}`, rotulo: `Votos: ${rotuloItem(c)}` },
      { campo: `pct_${c.id}`, rotulo: `%: ${rotuloItem(c)}` }
    ]),
    ...(temComparacao ? [{ campo: 'diferenca', rotulo: 'Diferença' }] : [])
  ];

  const classeTh = 'p-2.5 font-semibold text-slate-700 cursor-pointer hover:text-slate-900 whitespace-nowrap bg-slate-100';

  return (
    <div className="flex-1 flex flex-col h-full bg-white text-slate-800 overflow-hidden select-none">
      <div className="p-3 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex rounded-lg bg-slate-100 p-1 border border-slate-300 text-xs font-semibold">
          <button
            onClick={() => setSubTab('dados')}
            className={`flex items-center gap-1.5 px-3 h-9 rounded-md transition cursor-pointer ${
              subTab === 'dados' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span>Tabela</span>
          </button>
          <button
            onClick={() => setSubTab('ranking')}
            className={`flex items-center gap-1.5 px-3 h-9 rounded-md transition cursor-pointer ${
              subTab === 'ranking' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>Ranking</span>
          </button>
          <button
            onClick={() => setSubTab('conferencia')}
            className={`flex items-center gap-1.5 px-3 h-9 rounded-md transition cursor-pointer ${
              subTab === 'conferencia' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Conferência</span>
            {pendenciasConferencia > 0 && (
              <span className="min-w-4 h-4 px-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-[10px] flex items-center justify-center font-bold">
                {pendenciasConferencia}
              </span>
            )}
          </button>
        </div>

        {subTab === 'dados' && podeBaixar && (
          <div className="flex items-center gap-2">
            <button
              onClick={baixarCSV}
              className="flex items-center gap-1.5 px-3 h-9 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
              title="Baixa o que está na tela, com ponto e vírgula"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Baixar CSV</span>
            </button>
            <button
              onClick={exportarPDF}
              className="flex items-center gap-1.5 px-3 h-9 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
              title="Exporta o que está na tela"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Exportar PDF</span>
            </button>
          </div>
        )}
      </div>

      {subTab === 'dados' && (
        <>
          <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 space-y-2 shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg bg-white p-0.5 border border-slate-300 text-xs font-semibold">
                {(Object.keys(NOMES_NIVEL) as Nivel[]).map((n) => (
                  <button
                    key={n}
                    onClick={() => setNivel(n)}
                    className={`px-2.5 h-9 rounded-md transition cursor-pointer whitespace-nowrap ${
                      nivel === n ? 'bg-slate-800 text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {NOMES_NIVEL[n]}
                  </button>
                ))}
              </div>

              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-3 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Buscar escola, bairro, zona ou seção"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="w-full h-9 bg-white border border-slate-300 rounded-lg pl-8 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {nivel !== 'bairro' &&
                zonasDisponiveis.length > 1 &&
                zonasDisponiveis.map((z) => {
                  const marcada = zonasMarcadas.includes(z);
                  return (
                    <button
                      key={z}
                      onClick={() => setZonasMarcadas(marcada ? zonasMarcadas.filter((x) => x !== z) : [...zonasMarcadas, z])}
                      className={`px-2.5 h-8 rounded-lg border font-mono font-semibold cursor-pointer ${
                        marcada ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-600'
                      }`}
                    >
                      Zona {z}
                    </button>
                  );
                })}
              <label className="flex items-center gap-1.5 text-slate-700">
                <span>A partir de</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="0"
                  value={minimoVotos}
                  onChange={(e) => setMinimoVotos(e.target.value)}
                  className="w-20 h-8 bg-white border border-slate-300 rounded-lg px-2 text-xs text-slate-900 font-mono"
                />
                <span>votos</span>
              </label>

              <label className="md:hidden flex items-center gap-1.5 text-slate-700 basis-full">
                <span className="shrink-0">Ordenar por</span>
                <select
                  value={ordem.campo}
                  onChange={(e) => setOrdem({ campo: e.target.value, crescente: e.target.value === 'titulo' })}
                  className="flex-1 min-w-0 h-9 bg-white border border-slate-300 rounded-lg px-2 text-xs text-slate-900"
                >
                  {opcoesDeOrdem.map((o) => (
                    <option key={o.campo} value={o.campo}>
                      {o.rotulo}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {candidatosSelecionados.length === 0 && (
            <div className="p-3 text-xs text-slate-600 bg-white border-b border-slate-200">
              Nenhum item marcado. Marque um candidato para ver os votos; por enquanto a tabela mostra só os eleitores.
            </div>
          )}

          <div className="md:hidden flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50">
            {linhasVisiveis.length === 0 && <div className="p-6 text-center text-slate-500 text-xs">Nada encontrado com esses filtros.</div>}
            {linhasVisiveis.slice(0, 400).map((l) => {
              const aberta = abertas.includes(l.chave);
              return (
                <div key={l.chave} className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-slate-900 leading-snug">{l.titulo}</div>
                      <div className="text-[11px] text-slate-500">{l.subtitulo}</div>
                      {l.observacao && <div className="text-[11px] text-amber-700">{l.observacao}</div>}
                    </div>
                    {somaveis.length > 1 && (
                      <div className="text-right shrink-0">
                        <div className="font-mono font-bold text-slate-900">{numero(l.total)}</div>
                        <div className="text-[10px] text-slate-500">total</div>
                      </div>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-600">
                    {anos.length === 0
                      ? ''
                      : anos
                          .map((a) => `${variosAnos ? `${a}: ` : ''}${l.eleitores[a] === null || l.eleitores[a] === undefined ? 'sem dado' : numero(l.eleitores[a] as number)}`)
                          .join(' · ') + ' eleitores'}
                  </div>
                  <div className="space-y-1">
                    {candidatosSelecionados.map((c) => {
                      const v = l.votos[c.id];
                      return (
                        <div key={c.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: corSegura(c.cor) }} />
                            <span className="truncate text-slate-800">{rotuloItem(c)}</span>
                          </span>
                          <span className="font-mono shrink-0 text-slate-900">
                            {v === null || v === undefined ? (
                              <span className="text-slate-500 font-sans text-[11px]">{l.observacao ? '-' : 'sem correspondência'}</span>
                            ) : (
                              <>
                                <strong>{numero(v)}</strong> <span className="text-slate-500">({pctTexto(pctDoItem(l, c))})</span>
                              </>
                            )}
                          </span>
                        </div>
                      );
                    })}
                    {temComparacao && l.diferenca !== undefined && (
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                        <span className="text-slate-600">Diferença</span>
                        <span className="font-mono font-bold text-slate-900">{l.diferenca === null ? '-' : comSinal(l.diferenca)}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    {nivel === 'escola' && l.secoes && (
                      <button
                        onClick={() => alternarAberta(l.chave)}
                        className="flex-1 h-10 flex items-center justify-center gap-1 bg-slate-100 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 cursor-pointer"
                      >
                        {aberta ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        {aberta ? 'Fechar seções' : `Ver ${l.secoes.length} seções`}
                      </button>
                    )}
                    {l.localKey && (nivel === 'escola' || nivel === 'secao') && (
                      <button
                        onClick={() => onSelectLocal(l.localKey!)}
                        className="flex-1 h-10 flex items-center justify-center gap-1 bg-blue-50 border border-blue-200 rounded-lg text-xs font-semibold text-blue-800 cursor-pointer"
                      >
                        <MapPin className="w-4 h-4" />
                        Ver no mapa
                      </button>
                    )}
                  </div>
                  {aberta && l.secoes && (
                    <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                      {[...l.secoes]
                        .sort((a, b) => a.secao.localeCompare(b.secao))
                        .map((sec) => (
                          <div key={`${sec.zona}_${sec.secao}`} className="p-2 text-[11px] flex items-center justify-between gap-2">
                            <span className="text-slate-800">
                              <strong>Seção {sec.secao}</strong>
                              {sec.isAgregada ? <span className="text-amber-700"> · agregada à {sec.secaoDestino}</span> : <span className="text-slate-500"> · {numero(sec.aptos)} eleitores</span>}
                            </span>
                            <span className="font-mono text-slate-900 shrink-0">
                              {sec.isAgregada
                                ? '-'
                                : candidatosSelecionados
                                    .map((c) => (sec.votosPorCandidato[c.id] === undefined ? '-' : numero(sec.votosPorCandidato[c.id])))
                                    .join(' · ')}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
            {linhasVisiveis.length > 400 && (
              <div className="p-3 text-center text-[11px] text-slate-500">Mostrando 400 de {numero(linhasVisiveis.length)}. Use a busca para achar o resto{podeBaixar ? '; o CSV e o PDF levam tudo' : ''}.</div>
            )}
            {linhasVisiveis.length > 0 && (
              <div className="bg-slate-800 text-white rounded-xl p-3 space-y-1 text-xs">
                <div className="font-bold">Total ({numero(linhasVisiveis.length)} {linhasVisiveis.length === 1 ? 'linha' : 'linhas'})</div>
                <div className="text-slate-200">
                  {anos.map((a) => `${variosAnos ? `${a}: ` : ''}${numero(totais.eleitores[a] || 0)}`).join(' · ')} eleitores
                </div>
                {candidatosSelecionados.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{rotuloItem(c)}</span>
                    <span className="font-mono font-bold shrink-0">{numero(totais.votos[c.id] || 0)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="hidden md:block flex-1 overflow-auto">
            <table className="w-full text-left text-xs border-separate border-spacing-0">
              <thead className="sticky top-0 z-20 select-none">
                <tr>
                  <th onClick={() => mudarOrdem('titulo')} className={`${classeTh} sticky left-0 z-30 border-b border-slate-300 min-w-[240px]`}>
                    {nivel === 'secao' ? 'Seção' : nivel === 'escola' ? 'Escola' : nivel === 'bairro' ? 'Bairro' : 'Zona'}
                    {seta('titulo')}
                  </th>
                  {anos.map((a) => (
                    <th key={a} onClick={() => mudarOrdem(`eleitores_${a}`)} className={`${classeTh} text-right border-b border-slate-300`}>
                      {variosAnos ? `Eleitores ${a}` : 'Eleitores'}
                      {seta(`eleitores_${a}`)}
                    </th>
                  ))}
                  {candidatosSelecionados.map((c) => (
                    <React.Fragment key={c.id}>
                      <th
                        onClick={() => mudarOrdem(`votos_${c.id}`)}
                        className={`${classeTh} text-right border-b border-slate-300 border-l border-l-slate-200`}
                        title={`${c.nome} (${c.numero}) ${c.ano}`}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: corSegura(c.cor) }} />
                          {c.nome.split(' ')[0]} {c.numero} {variosAnos ? c.ano : ''}
                        </span>
                        {seta(`votos_${c.id}`)}
                      </th>
                      <th onClick={() => mudarOrdem(`pct_${c.id}`)} className={`${classeTh} text-right border-b border-slate-300`}>
                        %{seta(`pct_${c.id}`)}
                      </th>
                    </React.Fragment>
                  ))}
                  {somaveis.length > 1 && (
                    <th onClick={() => mudarOrdem('total')} className={`${classeTh} text-right border-b border-slate-300 border-l border-l-slate-200`}>
                      Total{seta('total')}
                    </th>
                  )}
                  {temComparacao && (
                    <th onClick={() => mudarOrdem('diferenca')} className={`${classeTh} text-right border-b border-slate-300`}>
                      Diferença{seta('diferenca')}
                    </th>
                  )}
                </tr>
              </thead>

              <tbody className="font-mono">
                {linhasVisiveis.length === 0 ? (
                  <tr>
                    <td colSpan={2 + anos.length + candidatosSelecionados.length * 2 + 2} className="p-8 text-center text-slate-500 font-sans">
                      Nada encontrado com esses filtros.
                    </td>
                  </tr>
                ) : (
                  linhasVisiveis.map((l) => {
                    const aberta = abertas.includes(l.chave);
                    const expansivel = nivel === 'escola' && Boolean(l.secoes);
                    return (
                      <React.Fragment key={l.chave}>
                        <tr className="group hover:bg-slate-50">
                          <td className="p-2 sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-b border-slate-200 font-sans">
                            <div className="flex items-start gap-1.5">
                              {expansivel ? (
                                <button
                                  onClick={() => alternarAberta(l.chave)}
                                  aria-label={aberta ? 'Fechar seções' : 'Abrir seções'}
                                  className="mt-0.5 w-6 h-6 flex items-center justify-center rounded hover:bg-slate-200 text-slate-600 cursor-pointer shrink-0"
                                >
                                  {aberta ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                </button>
                              ) : null}
                              <div className="min-w-0">
                                {l.localKey && (nivel === 'escola' || nivel === 'secao') ? (
                                  <button onClick={() => onSelectLocal(l.localKey!)} className="text-left font-semibold text-slate-900 hover:text-blue-700 cursor-pointer" title="Ver no mapa">
                                    {l.titulo}
                                  </button>
                                ) : (
                                  <span className="font-semibold text-slate-900">{l.titulo}</span>
                                )}
                                <div className="text-[10px] text-slate-500">{l.subtitulo}</div>
                                {l.observacao && <div className="text-[10px] text-amber-700">{l.observacao}</div>}
                              </div>
                            </div>
                          </td>
                          {anos.map((a) => (
                            <td key={a} className="p-2 text-right text-slate-700 border-b border-slate-200">
                              {l.eleitores[a] === null || l.eleitores[a] === undefined ? '-' : numero(l.eleitores[a] as number)}
                            </td>
                          ))}
                          {candidatosSelecionados.map((c) => {
                            const v = l.votos[c.id];
                            return (
                              <React.Fragment key={c.id}>
                                <td className="p-2 text-right font-bold text-slate-900 border-b border-slate-200 border-l border-l-slate-100">
                                  {v === null || v === undefined ? (
                                    <span className="font-sans font-normal text-[10px] text-slate-500">{l.observacao ? '-' : 'sem corresp.'}</span>
                                  ) : (
                                    numero(v)
                                  )}
                                </td>
                                <td className="p-2 text-right text-slate-600 border-b border-slate-200">{pctTexto(pctDoItem(l, c))}</td>
                              </React.Fragment>
                            );
                          })}
                          {somaveis.length > 1 && (
                            <td className="p-2 text-right font-bold text-blue-700 border-b border-slate-200 border-l border-l-slate-100">{numero(l.total)}</td>
                          )}
                          {temComparacao && (
                            <td className="p-2 text-right font-bold text-slate-900 border-b border-slate-200">
                              {l.diferenca === null || l.diferenca === undefined ? '-' : comSinal(l.diferenca)}
                            </td>
                          )}
                        </tr>

                        {aberta &&
                          l.secoes &&
                          [...l.secoes]
                            .sort((a, b) => a.secao.localeCompare(b.secao))
                            .map((sec) => (
                              <tr key={`${l.chave}_${sec.zona}_${sec.secao}`} className="bg-slate-50">
                                <td className="py-1.5 pr-2 pl-10 sticky left-0 z-10 bg-slate-50 border-b border-slate-100 font-sans text-slate-700">
                                  Seção {sec.secao}
                                  {sec.isAgregada && <span className="text-amber-700"> · agregada à {sec.secaoDestino || 'principal'}</span>}
                                </td>
                                {anos.map((a) => {
                                  const e = sec.aptosPorAno && sec.aptosPorAno[a] !== undefined ? sec.aptosPorAno[a] : variosAnos ? null : sec.aptos;
                                  return (
                                    <td key={a} className="py-1.5 px-2 text-right text-slate-600 border-b border-slate-100">
                                      {e === null ? '-' : numero(e)}
                                    </td>
                                  );
                                })}
                                {candidatosSelecionados.map((c) => {
                                  const v = sec.votosPorCandidato[c.id];
                                  const e = sec.aptosPorAno && sec.aptosPorAno[c.ano] !== undefined ? sec.aptosPorAno[c.ano] : sec.aptos;
                                  const semDado = sec.isAgregada || v === undefined;
                                  return (
                                    <React.Fragment key={c.id}>
                                      <td className="py-1.5 px-2 text-right text-slate-800 border-b border-slate-100 border-l border-l-slate-100">{semDado ? '-' : numero(v)}</td>
                                      <td className="py-1.5 px-2 text-right text-slate-500 border-b border-slate-100">{semDado || !e ? '-' : pctTexto((v / e) * 100)}</td>
                                    </React.Fragment>
                                  );
                                })}
                                {somaveis.length > 1 && (
                                  <td className="py-1.5 px-2 text-right text-slate-800 border-b border-slate-100 border-l border-l-slate-100">
                                    {sec.isAgregada ? '-' : numero(sec.votosTotalMarcados)}
                                  </td>
                                )}
                                {temComparacao && <td className="border-b border-slate-100" />}
                              </tr>
                            ))}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>

              {linhasVisiveis.length > 0 && (
                <tfoot className="sticky bottom-0 z-20 font-mono">
                  <tr>
                    <td className="p-2.5 sticky left-0 z-30 bg-slate-800 text-white font-sans font-bold">
                      Total ({numero(linhasVisiveis.length)} {linhasVisiveis.length === 1 ? 'linha' : 'linhas'})
                    </td>
                    {anos.map((a) => (
                      <td key={a} className="p-2.5 text-right bg-slate-800 text-white font-bold">
                        {numero(totais.eleitores[a] || 0)}
                      </td>
                    ))}
                    {candidatosSelecionados.map((c) => {
                      const v = totais.votos[c.id] || 0;
                      const e = totais.eleitores[c.ano] || 0;
                      return (
                        <React.Fragment key={c.id}>
                          <td className="p-2.5 text-right bg-slate-800 text-white font-bold">{numero(v)}</td>
                          <td className="p-2.5 text-right bg-slate-800 text-slate-200">{e > 0 ? pctTexto((v / e) * 100) : '-'}</td>
                        </React.Fragment>
                      );
                    })}
                    {somaveis.length > 1 && <td className="p-2.5 text-right bg-slate-800 text-white font-bold">{numero(totais.total)}</td>}
                    {temComparacao && <td className="p-2.5 text-right bg-slate-800 text-white font-bold">{comSinal(totais.diferenca)}</td>}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {semLocalizacao.length > 0 && (
            <div className="shrink-0 px-3 py-2 border-t border-amber-200 bg-amber-50 text-[11px] text-amber-900">
              Fora desta tabela: {numero(semLocalizacao.reduce((a, v) => a + v.votos, 0))} votos em {semLocalizacao.length} seções que não estão no cadastro de locais (veja a aba Conferência). Eles entram no total do topo.
            </div>
          )}
        </>
      )}

      {subTab === 'ranking' && (
        <div className="flex-1 overflow-auto p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <h3 className="text-sm font-bold text-slate-900">Escolas com mais votos dos itens marcados</h3>
            <span className="text-xs text-slate-500 font-mono">{rankingLocais.length} locais</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {rankingLocais.map((loc, idx) => {
              const rank = idx + 1;
              const pctBar = Math.min(100, Math.max(5, (loc.totalVotosMarcados / maxVotosRanking) * 100));

              return (
                <div
                  key={loc.key}
                  onClick={() => onSelectLocal(loc.key)}
                  className="p-3.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl cursor-pointer transition group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span
                        className={`w-7 h-6 rounded-md font-mono text-xs font-bold flex items-center justify-center shrink-0 ${
                          rank <= 3 ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {rank}
                      </span>
                      <div className="min-w-0">
                        <h4 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-blue-700 transition truncate">{loc.nome_local}</h4>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          Zona {loc.zona} · Local nº {loc.local_num} · {loc.bairro}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-mono text-sm font-bold text-slate-900">
                        {numero(loc.totalVotosMarcados)} <span className="text-xs font-normal text-slate-500">votos</span>
                      </div>
                      {!variosAnos && <div className="font-mono text-xs font-semibold text-slate-600">{loc.pctSobreEleitores.toFixed(1)}% dos eleitores</div>}
                    </div>
                  </div>

                  <div className="w-full h-1.5 bg-slate-200 rounded-full mt-2.5 overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pctBar}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {subTab === 'conferencia' && (
        <div className="flex-1 overflow-auto p-4 space-y-5">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-300">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <AlertTriangle className={`w-4 h-4 ${semLocalizacao.length > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
                <span>Votos em seções sem localização ({semLocalizacao.length})</span>
              </h3>
              <span className="text-xs text-slate-500">Seções com votos que não estão no cadastro de locais do ano</span>
            </div>
            {semLocalizacao.length === 0 ? (
              <p className="text-emerald-700 text-xs font-semibold">Todas as seções com votos estão no cadastro de locais.</p>
            ) : (
              <div className="border border-slate-300 rounded-lg overflow-hidden font-mono text-xs max-h-72 overflow-y-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 text-slate-700 border-b border-slate-300 sticky top-0">
                    <tr>
                      <th className="p-2 font-sans">Item</th>
                      <th className="p-2 font-sans">Zona</th>
                      <th className="p-2 font-sans">Seção</th>
                      <th className="p-2 font-sans text-right">Votos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {semLocalizacao.map((v) => (
                      <tr key={`${v.candidatoId}_${v.zona}_${v.secao}`}>
                        <td className="p-2 font-sans text-slate-800">{nomeDoItem(v.candidatoId)}</td>
                        <td className="p-2">{v.zona}</td>
                        <td className="p-2">{v.secao}</td>
                        <td className="p-2 text-right font-bold text-slate-900">{numero(v.votos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {variosAnos && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-300">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <AlertTriangle className={`w-4 h-4 ${escolasSemCorrespondencia.length > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
                  <span>Escolas sem correspondência entre as eleições ({escolasSemCorrespondencia.length})</span>
                </h3>
                <span className="text-xs text-slate-500">Podem ser ligadas à mão em Gestão de dados, aba Escolas entre anos</span>
              </div>
              {escolasSemCorrespondencia.length === 0 ? (
                <p className="text-emerald-700 text-xs font-semibold">Todas as escolas foram encontradas em todas as eleições marcadas.</p>
              ) : (
                <div className="border border-slate-300 rounded-lg overflow-hidden text-xs max-h-72 overflow-y-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100 text-slate-700 border-b border-slate-300 sticky top-0">
                      <tr>
                        <th className="p-2">Escola</th>
                        <th className="p-2">Existe em</th>
                        <th className="p-2">Sem dado para</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {escolasSemCorrespondencia.map((l) => (
                        <tr key={l.key}>
                          <td className="p-2 text-slate-900">
                            <button onClick={() => onSelectLocal(l.key)} className="text-left font-semibold hover:text-blue-700 cursor-pointer">
                              {l.nome_local}
                            </button>
                            <div className="text-[10px] text-slate-500">
                              Zona {l.zona} · Local {l.local_num} · {l.bairro}
                            </div>
                          </td>
                          <td className="p-2 font-mono">{(l.anosPresentes || []).join(', ')}</td>
                          <td className="p-2">{(l.semCorrespondencia || []).map(nomeDoItem).join('; ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-300">
              <h3 className="text-sm font-bold text-slate-900">Seções agregadas ({secoesAgregadas.length})</h3>
              <span className="text-xs text-slate-500">Os votos delas já estão na seção principal</span>
            </div>

            {secoesAgregadas.length === 0 ? (
              <p className="text-slate-500 text-xs">Nenhuma seção agregada nos dados em tela.</p>
            ) : (
              <div className="border border-slate-300 rounded-lg overflow-hidden font-mono text-xs max-h-72 overflow-y-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 text-slate-700 border-b border-slate-300 sticky top-0">
                    <tr>
                      <th className="p-2 font-sans">Zona</th>
                      <th className="p-2 font-sans">Seção agregada</th>
                      <th className="p-2 font-sans">Seção principal</th>
                      <th className="p-2 font-sans">Local de votação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {secoesAgregadas.map((s) => (
                      <tr key={`${s.zona}_${s.secao}`}>
                        <td className="p-2 text-slate-900 font-sans">Zona {s.zona}</td>
                        <td className="p-2 font-bold text-slate-900">{s.secao}</td>
                        <td className="p-2 font-bold text-slate-900">{s.secaoDestino || 'principal'}</td>
                        <td className="p-2 font-sans text-slate-700">
                          {s.nome_local} ({s.bairro})
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-300">
              <h3 className="text-sm font-bold text-slate-900">Seções sem coordenadas ({secoesSemCoordenadas.length})</h3>
              <span className="text-xs text-slate-500">Aparecem na tabela, mas não têm ponto no mapa</span>
            </div>

            {secoesSemCoordenadas.length === 0 ? (
              <p className="text-emerald-700 text-xs font-semibold">Todas as seções têm coordenadas cadastradas.</p>
            ) : (
              <div className="border border-slate-300 rounded-lg overflow-hidden font-mono text-xs max-h-72 overflow-y-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 text-slate-700 border-b border-slate-300 sticky top-0">
                    <tr>
                      <th className="p-2 font-sans">Zona</th>
                      <th className="p-2 font-sans">Seção</th>
                      <th className="p-2 font-sans">Local de votação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {secoesSemCoordenadas.map((s) => (
                      <tr key={`${s.zona}_${s.secao}`}>
                        <td className="p-2 text-slate-900 font-sans">Zona {s.zona}</td>
                        <td className="p-2 font-bold text-slate-900">{s.secao}</td>
                        <td className="p-2 font-sans text-slate-700">
                          {s.nome_local} ({s.bairro})
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
