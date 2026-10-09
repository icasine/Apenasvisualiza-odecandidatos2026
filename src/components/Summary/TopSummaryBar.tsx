import React, { useMemo, useState } from 'react';
import { Users, Award, Vote, Percent, TrendingUp, ChevronRight, X } from 'lucide-react';
import { CandidatoInfo, CARGOS_DISPONIVEIS } from '../../types/election';
import { chaveDaPessoa, pessoaDoItem } from '../../utils/itens';

interface TopSummaryBarProps {
  candidatosSelecionados: CandidatoInfo[];
  totalVotos: number;
  totalEleitores: number;
  pctSobreEleitores: number;
  porAno?: Array<{ ano: string; votos: number; eleitores: number; pct: number }>;
  comparacao?: {
    rotuloDe: string;
    rotuloPara: string;
    votosDe: number;
    votosPara: number;
    diferencaVotos: number;
    diferencaPct: number | null;
  } | null;
  votosSemLocalizacao?: number;
  acoes?: React.ReactNode;
  seguidores?: { total: number; comPerfil: number; pessoas: number } | null;
  onEscolher?: () => void;
  fotoDe?: (nome: string, itens: CandidatoInfo[]) => string | undefined;
  rotuloPartido?: (item: CandidatoInfo) => string;
}

interface PessoaMarcada {
  chave: string;
  nome: string;
  cor: string;
  foto?: string;
  itens: CandidatoInfo[];
}

const numero = (n: number): string => n.toLocaleString('pt-BR');
const pct = (n: number): string => `${n.toFixed(2).replace('.', ',')}%`;

export const TopSummaryBar: React.FC<TopSummaryBarProps> = ({
  candidatosSelecionados,
  totalVotos,
  totalEleitores,
  pctSobreEleitores,
  porAno = [],
  comparacao,
  votosSemLocalizacao = 0,
  acoes,
  seguidores,
  onEscolher,
  fotoDe,
  rotuloPartido
}) => {
  const variosAnos = porAno.length > 1;
  const convidar = candidatosSelecionados.length === 0 && Boolean(onEscolher);
  const [verTodos, setVerTodos] = useState(false);
  const [semImagem, setSemImagem] = useState<Set<string>>(new Set());
  const pessoas = useMemo<PessoaMarcada[]>(() => {
    const mapa = new Map<string, PessoaMarcada>();
    candidatosSelecionados.forEach((c) => {
      const chave = chaveDaPessoa(c) || c.id;
      const atual = mapa.get(chave);
      if (atual) atual.itens.push(c);
      else mapa.set(chave, { chave, nome: pessoaDoItem(c) || c.nome, cor: c.cor || '#2563eb', itens: [c] });
    });
    return Array.from(mapa.values()).map((p) => ({ ...p, foto: fotoDe ? fotoDe(p.nome, p.itens) : undefined }));
  }, [candidatosSelecionados, fotoDe]);
  const temFoto = (p: PessoaMarcada) => Boolean(p.foto) && !semImagem.has(p.chave);
  const primeiroNome = (p: PessoaMarcada) => p.nome.trim().split(/\s+/)[0] || p.nome;
  const linhaDoItem = (i: CandidatoInfo) =>
    `${CARGOS_DISPONIVEIS[i.cargo] || i.cargo} ${i.ano}${i.numero ? ` · nº ${i.numero}` : ''}${i.partido ? ` · ${rotuloPartido ? rotuloPartido(i) : i.partido}` : ''}${i.totalVotos != null ? ` · ${numero(i.totalVotos)} votos` : ''}`;
  const resumoDaPessoa = (p: PessoaMarcada) => [p.nome, ...p.itens.map(linhaDoItem)].join('\n');
  let largura = 0;
  const posicoes = pessoas.map((p) => {
    largura += temFoto(p) ? 40 : 80;
    return largura;
  });
  const cabeNoCelular = posicoes.filter((x) => x <= 230).length;
  const cabeNaTelaLarga = posicoes.filter((x) => x <= 300).length;
  const rosto = (p: PessoaMarcada, grande = false) =>
    temFoto(p) ? (
      <img
        src={p.foto}
        alt={p.nome}
        referrerPolicy="no-referrer"
        onError={() => setSemImagem((antes) => new Set(antes).add(p.chave))}
        className={`${grande ? 'w-11 h-11' : 'w-9 h-9'} shrink-0 rounded-full object-cover border-2 bg-slate-100`}
        style={{ borderColor: p.cor }}
      />
    ) : grande ? (
      <span className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-base font-bold text-white" style={{ backgroundColor: p.cor }}>
        {primeiroNome(p).charAt(0).toUpperCase()}
      </span>
    ) : (
      <span className="h-9 max-w-[4.5rem] px-2.5 shrink-0 rounded-full border-2 bg-white text-xs font-semibold text-slate-800 flex items-center" style={{ borderColor: p.cor }}>
        <span className="truncate">{primeiroNome(p)}</span>
      </span>
    );

  return (
    <div className="bg-white border-b border-slate-200 px-3 sm:px-4 py-2 lg:py-1.5 shrink-0 select-none flex flex-col-reverse lg:flex-row lg:items-start gap-2 lg:gap-3">
      <div className="flex-1 min-w-0 grid grid-cols-3 gap-x-3 gap-y-2 md:flex md:flex-wrap md:items-center md:justify-start md:gap-x-5 md:gap-y-1.5 text-xs text-slate-500">
        {convidar && (
          <button type="button" onClick={onEscolher} className="lg:hidden col-span-3 w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-blue-50 border-2 border-blue-300 text-left cursor-pointer">
            <span className="shrink-0 w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center">
              <Users className="w-5 h-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-blue-900">Comece escolhendo um candidato</span>
              <span className="block text-xs text-blue-800 leading-snug">Toque aqui para abrir a lista. Os votos de quem você marcar aparecem no mapa.</span>
            </span>
            <ChevronRight className="w-5 h-5 text-blue-700 shrink-0" />
          </button>
        )}
        <div className={`col-span-3 ${convidar ? 'hidden lg:flex' : 'flex'} items-center gap-2 min-w-0 md:max-w-md`}>
          {pessoas.length === 0 ? (
            <>
              <div className="p-1.5 rounded-md bg-blue-50 text-blue-600 border border-blue-200 shrink-0">
                <Award className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Marcados (0)</div>
                <div className="font-semibold truncate text-xs sm:text-sm">
                  <span className="text-slate-500 italic">Nenhum marcado</span>
                </div>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setVerTodos(true)}
              aria-label="Ver todos os marcados"
              className="min-w-0 max-w-full flex items-center gap-2 text-left rounded-lg cursor-pointer hover:bg-slate-50 overflow-hidden"
            >
              <span className="flex items-center gap-1 shrink-0">
                {pessoas.slice(0, cabeNaTelaLarga).map((p, i) => (
                  <span key={p.chave} title={resumoDaPessoa(p)} className={i >= cabeNoCelular ? 'hidden sm:block' : 'block'}>
                    {rosto(p)}
                  </span>
                ))}
                {pessoas.length > cabeNoCelular && (
                  <span className={`${pessoas.length > cabeNaTelaLarga ? '' : 'sm:hidden '}h-9 min-w-9 px-2 shrink-0 rounded-full bg-slate-100 border border-slate-300 text-xs font-bold text-slate-700 flex items-center justify-center`}>
                    <span className="sm:hidden">+{pessoas.length - cabeNoCelular}</span>
                    <span className="hidden sm:inline">+{pessoas.length - cabeNaTelaLarga}</span>
                  </span>
                )}
              </span>
              {pessoas.length === 1 ? (
                <span className="min-w-0">
                  <span className="block text-[10px] uppercase tracking-wider text-slate-500 font-bold">Marcados ({candidatosSelecionados.length})</span>
                  <span className="block font-semibold text-slate-900 truncate text-xs sm:text-sm">
                    {pessoas[0].nome}
                    {pessoas[0].itens.length === 1 && (
                      <span className="text-slate-500 text-xs font-normal">
                        {' '}· {CARGOS_DISPONIVEIS[pessoas[0].itens[0].cargo] || pessoas[0].itens[0].cargo} {pessoas[0].itens[0].ano}
                        {pessoas[0].itens[0].numero ? ` (${pessoas[0].itens[0].numero})` : ''}
                      </span>
                    )}
                  </span>
                </span>
              ) : (
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-slate-500 font-bold whitespace-nowrap">
                  {candidatosSelecionados.length} marcados
                </span>
              )}
            </button>
          )}
        </div>

        <div className={`${variosAnos ? 'col-span-3 lg:col-span-1 ' : ''}flex items-center gap-2 min-w-0`}>
          <div className="hidden sm:block p-1.5 rounded-md bg-indigo-50 text-indigo-600 border border-indigo-200 shrink-0">
            <Vote className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold truncate">
              {variosAnos ? 'Votos somados' : 'Total de votos'}
            </div>
            <div className="font-mono tabular-nums text-slate-900 font-bold text-base">{numero(totalVotos)}</div>
            {votosSemLocalizacao > 0 && (
              <div className="text-[10px] text-amber-700 leading-tight">inclui {numero(votosSemLocalizacao)} sem localização</div>
            )}
          </div>
        </div>

        {!variosAnos && (
          <>
            <div className="flex items-center gap-2 min-w-0">
              <div className="hidden sm:block p-1.5 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-200 shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold truncate">Eleitores</div>
                <div className="font-mono tabular-nums text-slate-800 font-bold text-base">{numero(totalEleitores)}</div>
              </div>
            </div>

            <div className="flex items-center gap-2 min-w-0">
              <div className="hidden sm:block p-1.5 rounded-md bg-amber-50 text-amber-600 border border-amber-200 shrink-0">
                <Percent className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold truncate">% dos eleitores</div>
                <div className="font-mono tabular-nums text-amber-700 font-bold text-base">{pct(pctSobreEleitores)}</div>
              </div>
            </div>
          </>
        )}

        {variosAnos && (
          <div className="col-span-3 grid grid-cols-2 gap-x-3 gap-y-2 md:contents">
          {porAno.map((a) => (
            <div key={a.ano} className="flex items-center gap-2 min-w-0">
              <div className="px-1.5 py-1 rounded-md bg-slate-100 text-slate-800 border border-slate-300 shrink-0 font-mono font-bold text-[11px]">
                {a.ano}
              </div>
              <div className="min-w-0">
                <div className="font-mono tabular-nums text-slate-900 font-bold text-sm">{numero(a.votos)} votos</div>
                <div className="text-[10px] text-slate-500 leading-tight truncate">
                  {a.eleitores > 0 ? `${pct(a.pct)} de ${numero(a.eleitores)} eleitores` : 'eleitorado não carregado'}
                </div>
              </div>
            </div>
          ))}
          </div>
        )}

        {comparacao && (
          <div className="col-span-3 lg:col-span-1 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 min-w-0">
            <TrendingUp className="w-4 h-4 text-indigo-600 shrink-0" />
            <div className="text-[11px] leading-tight min-w-0">
              <span className="text-slate-600">
                De {comparacao.rotuloDe} para {comparacao.rotuloPara}:{' '}
              </span>
              <strong className="font-mono text-slate-900">
                {comparacao.diferencaVotos > 0 ? '+' : ''}
                {numero(comparacao.diferencaVotos)} votos
              </strong>
              <span className="text-slate-600">
                {' '}
                ({numero(comparacao.votosDe)} → {numero(comparacao.votosPara)}
                {comparacao.diferencaPct !== null
                  ? `; ${comparacao.diferencaPct > 0 ? '+' : ''}${comparacao.diferencaPct.toFixed(2).replace('.', ',')} p.p.`
                  : ''}
                )
              </span>
            </div>
          </div>
        )}
        {seguidores && (
          <div className="col-span-3 lg:col-span-1 text-xs">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Seguidores (redes ligadas)</div>
            <div className="font-semibold text-slate-900">
              {numero(seguidores.total)}
              {seguidores.total > 0 && totalVotos > 0 ? <span className="text-slate-600 font-normal"> · votos/seguidor {pct((totalVotos / seguidores.total) * 100)}</span> : null}
            </div>
            <div className="text-[10px] text-slate-500">{seguidores.comPerfil} de {seguidores.pessoas} com perfil</div>
          </div>
        )}
      </div>
      {acoes && <div className="shrink-0">{acoes}</div>}
      {verTodos && pessoas.length > 0 && (
        <div className="fixed inset-0 z-[2000] flex items-start justify-center p-3 pt-16 bg-slate-900/40" onClick={() => setVerTodos(false)}>
          <div className="w-full max-w-md max-h-[75vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200">
              <div className="font-bold text-slate-900 text-sm">Marcados ({candidatosSelecionados.length})</div>
              <button type="button" onClick={() => setVerTodos(false)} aria-label="Fechar" className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {pessoas.map((p) => (
                <div key={p.chave} className="flex items-start gap-3 p-2 rounded-xl border border-slate-200 bg-slate-50">
                  {rosto(p, true)}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900 text-sm">{p.nome}</div>
                    {p.itens.map((i) => (
                      <div key={i.id} className="text-xs text-slate-600 leading-snug">{linhaDoItem(i)}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {onEscolher && (
              <div className="lg:hidden px-3 py-3 border-t border-slate-200">
                <button type="button" onClick={() => { setVerTodos(false); onEscolher(); }} className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold cursor-pointer">
                  Trocar candidatos
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
