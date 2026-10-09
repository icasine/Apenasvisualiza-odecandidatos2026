import React from 'react';
import { Users, Award, Vote, Percent, TrendingUp } from 'lucide-react';
import { CandidatoInfo, CARGOS_DISPONIVEIS } from '../../types/election';

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
  seguidores
}) => {
  const variosAnos = porAno.length > 1;

  return (
    <div className="bg-white border-b border-slate-200 px-3 sm:px-4 py-1.5 shrink-0 select-none flex items-start gap-3">
      <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-3 gap-y-1.5 lg:flex lg:flex-wrap lg:items-center lg:justify-start lg:gap-x-5 text-xs text-slate-500">
        <div className="col-span-2 flex items-center gap-2 min-w-0 lg:max-w-sm">
          <div className="p-1.5 rounded-md bg-blue-50 text-blue-600 border border-blue-200 shrink-0">
            <Award className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
              Marcados ({candidatosSelecionados.length})
            </div>
            <div className="font-semibold text-slate-900 truncate text-xs sm:text-sm">
              {candidatosSelecionados.length === 0 ? (
                <span className="text-slate-500 italic">Nenhum marcado</span>
              ) : candidatosSelecionados.length === 1 ? (
                <span>
                  {candidatosSelecionados[0].nome}{' '}
                  {candidatosSelecionados[0].numero && (
                    <span className="font-mono text-blue-700">({candidatosSelecionados[0].numero})</span>
                  )}{' '}
                  <span className="text-slate-500 text-xs font-normal">
                    · {CARGOS_DISPONIVEIS[candidatosSelecionados[0].cargo] || candidatosSelecionados[0].cargo} {candidatosSelecionados[0].ano}
                  </span>
                </span>
              ) : (
                <span>
                  {candidatosSelecionados
                    .map((c) => `${c.nome.split(' ')[0]} ${variosAnos ? c.ano : c.numero ? `(${c.numero})` : ''}`.trim())
                    .join(', ')}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-md bg-indigo-50 text-indigo-600 border border-indigo-200 shrink-0">
            <Vote className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold truncate">
              {variosAnos ? 'Votos somados' : 'Total de votos'}
            </div>
            <div className="font-mono tabular-nums text-slate-900 font-bold text-sm sm:text-base">{numero(totalVotos)}</div>
            {votosSemLocalizacao > 0 && (
              <div className="text-[10px] text-amber-700 leading-tight">inclui {numero(votosSemLocalizacao)} sem localização</div>
            )}
          </div>
        </div>

        {!variosAnos && (
          <>
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-200 shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold truncate">Eleitores</div>
                <div className="font-mono tabular-nums text-slate-800 font-bold text-sm sm:text-base">{numero(totalEleitores)}</div>
              </div>
            </div>

            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 rounded-md bg-amber-50 text-amber-600 border border-amber-200 shrink-0">
                <Percent className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold truncate">% dos eleitores</div>
                <div className="font-mono tabular-nums text-amber-700 font-bold text-sm sm:text-base">{pct(pctSobreEleitores)}</div>
              </div>
            </div>
          </>
        )}

        {variosAnos &&
          porAno.map((a) => (
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

        {comparacao && (
          <div className="col-span-2 lg:col-span-1 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 min-w-0">
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
          <div className="col-span-2 lg:col-span-1 text-xs">
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
    </div>
  );
};
