import React, { useEffect, useMemo } from 'react';
import { X, ArrowLeft, Building, MapPin, Download, TrendingUp } from 'lucide-react';
import { CandidatoInfo, CARGOS_DISPONIVEIS, LocalAgrupado } from '../../types/election';
import { exportLocalToPDF } from '../../utils/pdfExport';
import { chaveDaPessoa, pessoaDoItem } from '../../utils/itens';

interface LocalDetailPanelProps {
  local: LocalAgrupado | null;
  onClose: () => void;
  candidatosSelecionados: CandidatoInfo[];
  podeBaixar?: boolean;
}

const numero = (n: number): string => n.toLocaleString('pt-BR');
const comSinal = (n: number): string => `${n > 0 ? '+' : ''}${n.toLocaleString('pt-BR')}`;
const corSegura = (cor: unknown): string => (typeof cor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(cor) ? cor : '#2563eb');

interface Serie {
  chave: string;
  nome: string;
  cor: string;
  porAno: Record<string, number | null>;
}

const GraficoEvolucao: React.FC<{ anos: string[]; series: Serie[] }> = ({ anos, series }) => {
  const largura = 420;
  const altura = 150;
  const margem = { esq: 38, dir: 44, topo: 12, base: 22 };
  const maximo = Math.max(1, ...series.flatMap((s) => anos.map((a) => s.porAno[a] ?? 0)));
  const x = (i: number) => margem.esq + (anos.length === 1 ? 0.5 : i / (anos.length - 1)) * (largura - margem.esq - margem.dir);
  const y = (v: number) => margem.topo + (1 - v / maximo) * (altura - margem.topo - margem.base);
  const marcas = [0, 0.5, 1].map((f) => Math.round(maximo * f));

  return (
    <svg viewBox={`0 0 ${largura} ${altura}`} className="w-full h-auto" role="img" aria-label="Evolução dos votos nesta escola por eleição">
      {marcas.map((m, i) => (
        <g key={i}>
          <line x1={margem.esq} x2={largura - margem.dir} y1={y(m)} y2={y(m)} stroke="#e2e8f0" strokeWidth={1} />
          <text x={margem.esq - 5} y={y(m) + 3} textAnchor="end" fontSize={9} fill="#64748b">
            {numero(m)}
          </text>
        </g>
      ))}
      {anos.map((a, i) => (
        <text key={a} x={x(i)} y={altura - 6} textAnchor="middle" fontSize={10} fill="#334155" fontWeight={600}>
          {a}
        </text>
      ))}
      {series.map((s) => {
        const trechos: string[] = [];
        let atual = '';
        anos.forEach((a, i) => {
          const v = s.porAno[a];
          if (v === null || v === undefined) {
            if (atual) trechos.push(atual);
            atual = '';
          } else {
            atual += `${atual ? ' L' : 'M'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
          }
        });
        if (atual) trechos.push(atual);
        const ultimo = [...anos].reverse().find((a) => s.porAno[a] !== null && s.porAno[a] !== undefined);
        return (
          <g key={s.chave}>
            {trechos.map((d, i) => (
              <path key={i} d={d} fill="none" stroke={s.cor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {anos.map((a, i) => {
              const v = s.porAno[a];
              if (v === null || v === undefined) return null;
              return (
                <circle key={a} cx={x(i)} cy={y(v)} r={4.5} fill={s.cor} stroke="#ffffff" strokeWidth={2}>
                  <title>{`${s.nome}, ${a}: ${numero(v)} votos`}</title>
                </circle>
              );
            })}
            {series.length <= 4 && ultimo && (
              <text x={x(anos.indexOf(ultimo)) + 8} y={y(s.porAno[ultimo] as number) + 3} fontSize={10} fill="#0f172a" fontWeight={700}>
                {numero(s.porAno[ultimo] as number)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

export const LocalDetailPanel: React.FC<LocalDetailPanelProps> = ({ local, onClose, candidatosSelecionados, podeBaixar = false }) => {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [onClose]);

  const anos = useMemo(() => Array.from(new Set(candidatosSelecionados.map((c) => c.ano))).sort(), [candidatosSelecionados]);
  const variosAnos = anos.length > 1;

  const series = useMemo<Serie[]>(() => {
    if (!local) return [];
    const mapa = new Map<string, Serie>();
    [...candidatosSelecionados]
      .sort((a, b) => Number(a.ano) - Number(b.ano))
      .forEach((c) => {
        const chave = `p:${chaveDaPessoa(c)}`;
        let s = mapa.get(chave);
        if (!s) {
          s = { chave, nome: pessoaDoItem(c), cor: corSegura(c.cor), porAno: {} };
          mapa.set(chave, s);
        }
        s.cor = corSegura(c.cor);
        const sem = (local.semCorrespondencia || []).includes(c.id);
        if (sem) {
          if (s.porAno[c.ano] === undefined) s.porAno[c.ano] = null;
        } else {
          s.porAno[c.ano] = ((s.porAno[c.ano] as number) || 0) + (local.votosPorCandidato[c.id] || 0);
        }
      });
    return Array.from(mapa.values());
  }, [local, candidatosSelecionados]);

  if (!local) return null;

  const sortedSecoes = [...local.secoes].sort((a, b) => a.zona.localeCompare(b.zona) || a.secao.localeCompare(b.secao));
  const eleitoresDoAno = (ano: string): number | null => {
    if (local.eleitoresPorAno && local.eleitoresPorAno[ano] !== undefined) return local.eleitoresPorAno[ano];
    return variosAnos ? null : local.totalEleitoresAptos;
  };
  const nomeDoItem = (id: string): string => {
    const c = candidatosSelecionados.find((x) => x.id === id);
    return c ? `${c.nome} ${c.ano}` : '';
  };
  const soNumAno = (local.anosPresentes || []).length === 1 && local.key.includes(':');

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md sm:max-w-lg bg-white border-l border-slate-200 shadow-2xl flex flex-col text-slate-800 animate-slide-left">
      <div className="p-4 border-b border-slate-200 flex items-start justify-between gap-2 bg-white/95 sticky top-0 z-10">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-blue-600 font-semibold">
            <Building className="w-3.5 h-3.5" />
            <span>
              Zona {local.zona} · Local nº {local.local_num}
            </span>
          </div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 mt-1 leading-snug break-words">{local.nome_local}</h2>
          <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
            <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
            <span className="truncate">
              {local.endereco || 'Endereço não informado'} · {local.bairro}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {podeBaixar && (
            <button
              onClick={() => exportLocalToPDF(local, candidatosSelecionados)}
              className="flex items-center gap-1 px-2.5 h-11 sm:h-9 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-xs transition active:scale-95 cursor-pointer"
              title="Baixar boletim deste local em PDF"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Baixar PDF</span>
              <span className="sm:hidden">PDF</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="flex items-center justify-center w-11 h-11 sm:w-9 sm:h-9 text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition active:scale-95 cursor-pointer"
            aria-label="Fechar painel e voltar ao mapa"
            title="Fechar e voltar ao mapa"
          >
            <X className="w-6 h-6 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
        {soNumAno && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
            Esta escola só aparece no cadastro de {local.anosPresentes![0]}. O app não encontrou correspondência dela nas outras eleições marcadas.
          </div>
        )}

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Total do local</span>
            <span className="text-xs text-slate-500 font-mono">
              {local.secoes.length} {local.secoes.length === 1 ? 'seção' : 'seções'}
            </span>
          </div>

          {!variosAnos && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-[10px] uppercase text-slate-500 font-bold">Eleitores aptos</div>
                <div className="font-mono tabular-nums text-sm sm:text-base font-bold text-slate-900 mt-0.5">{numero(local.totalEleitoresAptos)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-slate-500 font-bold">Votos marcados</div>
                <div className="font-mono tabular-nums text-sm sm:text-base font-bold text-blue-600 mt-0.5">{numero(local.totalVotosMarcados)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-slate-500 font-bold">% dos eleitores</div>
                <div className="font-mono tabular-nums text-sm sm:text-base font-bold text-amber-700 mt-0.5">{local.pctSobreEleitores.toFixed(2).replace('.', ',')}%</div>
              </div>
            </div>
          )}

          {candidatosSelecionados.length > 0 && (
            <div className={`${variosAnos ? '' : 'pt-2 border-t border-slate-200'} space-y-1.5`}>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Votação por item:</span>
              {candidatosSelecionados.map((cand) => {
                const sem = (local.semCorrespondencia || []).includes(cand.id);
                const votos = local.votosPorCandidato[cand.id] || 0;
                const eleitores = eleitoresDoAno(cand.ano);
                const pct = eleitores && eleitores > 0 ? (votos / eleitores) * 100 : 0;
                return (
                  <div key={cand.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white border border-slate-200">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: corSegura(cand.cor) }} />
                      <span className="font-semibold text-slate-900 truncate">
                        {cand.nome} {cand.numero ? `(${cand.numero})` : ''}
                      </span>
                      <span className="text-[10px] text-slate-500 shrink-0">
                        {CARGOS_DISPONIVEIS[cand.cargo] || cand.cargo} {cand.ano}
                      </span>
                    </div>

                    <div className="font-mono tabular-nums text-right shrink-0">
                      {sem ? (
                        <span className="text-slate-500 text-[11px] font-sans">sem correspondência</span>
                      ) : (
                        <>
                          <strong className="text-slate-900 text-xs">{numero(votos)}</strong>{' '}
                          <span className="text-slate-500 text-[11px]">({pct.toFixed(1).replace('.', ',')}%)</span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {local.comparacao && (
            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl space-y-1">
              <div className="font-bold text-indigo-800 flex items-center gap-1.5 text-xs">
                <TrendingUp className="w-4 h-4 text-indigo-600" />
                <span>
                  De {nomeDoItem(local.comparacao.deId)} para {nomeDoItem(local.comparacao.paraId)}
                </span>
              </div>
              <div className="text-[11px] text-slate-700">
                {local.comparacao.diferencaVotos === null ? (
                  <span>Sem correspondência desta escola em um dos dois anos: não dá para comparar aqui.</span>
                ) : (
                  <>
                    Variação: <strong className="text-slate-900 font-mono">{comSinal(local.comparacao.diferencaVotos)} votos</strong> ({numero(local.comparacao.votosDe || 0)} →{' '}
                    {numero(local.comparacao.votosPara || 0)}
                    {local.comparacao.diferencaPct !== null
                      ? `; ${local.comparacao.diferencaPct > 0 ? '+' : ''}${local.comparacao.diferencaPct.toFixed(2).replace('.', ',')} p.p. sobre os eleitores de cada ano`
                      : ''}
                    )
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {variosAnos && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">Evolução nesta escola</span>

            {series.length > 1 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-700">
                {series.map((s) => (
                  <span key={s.chave} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.cor }} />
                    {s.nome}
                  </span>
                ))}
              </div>
            )}
            <div className="bg-white border border-slate-200 rounded-lg p-2">
              <GraficoEvolucao anos={anos} series={series} />
            </div>

            <div className="space-y-2">
              {anos.map((ano, idx) => {
                const eleitores = eleitoresDoAno(ano);
                const existe = (local.anosPresentes || []).includes(ano);
                return (
                  <div key={ano} className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <strong className="text-slate-900 text-sm font-mono">{ano}</strong>
                      <span className="text-[11px] text-slate-600">
                        {existe && eleitores !== null ? `${numero(eleitores)} eleitores` : 'escola sem correspondência neste ano'}
                      </span>
                    </div>
                    {series.map((s) => {
                      const v = s.porAno[ano];
                      if (v === undefined) return null;
                      let anterior: number | null = null;
                      for (let i = idx - 1; i >= 0; i--) {
                        const va = s.porAno[anos[i]];
                        if (va !== null && va !== undefined) {
                          anterior = va;
                          break;
                        }
                      }
                      return (
                        <div key={s.chave} className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.cor }} />
                            <span className="truncate text-slate-800">{s.nome}</span>
                          </span>
                          {v === null ? (
                            <span className="text-slate-500 shrink-0">sem correspondência</span>
                          ) : (
                            <span className="font-mono tabular-nums shrink-0 text-slate-900">
                              <strong>{numero(v)}</strong>
                              {eleitores && eleitores > 0 ? <span className="text-slate-500"> ({((v / eleitores) * 100).toFixed(1).replace('.', ',')}%)</span> : null}
                              {anterior !== null && <span className="text-slate-700"> · {comSinal(v - anterior)}</span>}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              <p className="text-[10px] text-slate-500">O número depois do ponto é a diferença para a eleição anterior da mesma pessoa.</p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider">Seções eleitorais ({local.secoes.length})</h3>
            <span className="text-[11px] text-slate-500">Eleitores e votos</span>
          </div>
          {local.secoes.some((s) => String(s.secao).startsWith('Outras')) && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
              "Outras": votos de anos antigos vindos de seções ou escolas desativadas. Os eleitores foram remanejados e não dá para saber a seção atual de cada um; por isso esses votos ficam nesta escola, fora das seções.
            </p>
          )}

          <div className="border border-slate-200 rounded-xl overflow-x-auto bg-white">
            <table className="w-full text-left font-mono">
              <thead className="bg-slate-100 text-slate-700 text-[11px] border-b border-slate-200">
                <tr>
                  <th className="p-2 font-sans">Seção</th>
                  <th className="p-2 text-right font-sans">Eleitores</th>
                  {candidatosSelecionados.map((c) => (
                    <th key={c.id} className="p-2 text-right" title={`${c.nome} (${c.numero}) ${c.ano}`}>
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-800">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: corSegura(c.cor) }} />
                        {variosAnos ? `${c.numero || c.nome.split(' ')[0]} ${c.ano.slice(2)}` : c.numero || c.nome.split(' ')[0]}
                      </span>
                    </th>
                  ))}
                  {!variosAnos && <th className="p-2 text-right font-sans">Total</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {sortedSecoes.map((sec) => (
                  <tr key={`${sec.zona}_${sec.secao}`} className="hover:bg-slate-100">
                    <td className="p-2 font-bold text-slate-900 font-sans">
                      <div>Seção {sec.secao}</div>
                      {sec.isAgregada && <div className="text-[10px] text-amber-700 font-sans mt-0.5">Agregada à {sec.secaoDestino || 'principal'}</div>}
                    </td>

                    <td className="p-2 text-right text-slate-700">{sec.isAgregada ? <span className="text-amber-700">-</span> : numero(sec.aptos)}</td>

                    {candidatosSelecionados.map((c) => {
                      const v = sec.votosPorCandidato[c.id];
                      return (
                        <td key={c.id} className="p-2 text-right text-slate-900 font-semibold">
                          {sec.isAgregada || v === undefined ? <span className="text-slate-400">-</span> : numero(v)}
                        </td>
                      );
                    })}

                    {!variosAnos && (
                      <td className="p-2 text-right font-bold text-blue-600">
                        {sec.isAgregada ? <span className="text-amber-700">-</span> : numero(sec.votosTotalMarcados)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {variosAnos && (
            <p className="text-[10px] text-slate-500">
              Cada coluna usa as seções do ano do item. Traço = a seção não existia nesta escola naquele ano.
            </p>
          )}
        </div>
      </div>

      <div
        className="sm:hidden shrink-0 px-3 pt-3 border-t border-slate-200 bg-white"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <button
          onClick={onClose}
          className="w-full flex items-center justify-center gap-2 h-12 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold shadow-md transition active:scale-95 cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Voltar ao mapa</span>
        </button>
      </div>
    </div>
  );
};
