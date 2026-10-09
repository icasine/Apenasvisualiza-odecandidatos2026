import React, { useEffect, useState } from 'react';
import { useProgressoDoAcesso } from '../../hooks/useProgressoDoAcesso';
import { ProgressoDoAcesso } from '../../utils/acesso';

const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1).replace('.', ',');

export function textoDoProgresso(p: ProgressoDoAcesso): string {
  if (p.esperandoServico) return 'Aguardando o serviço de acesso...';
  if (p.pct === null) return 'Recebendo os dados...';
  return `Recebendo os dados: ${p.pct}%`;
}

export const BarraDeProgresso: React.FC<{ progresso: ProgressoDoAcesso; className?: string }> = ({ progresso, className = '' }) => {
  const indefinido = progresso.esperandoServico || progresso.pct === null;
  return (
    <div
      role="progressbar"
      aria-label="Recebimento dos dados"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indefinido ? undefined : progresso.pct ?? undefined}
      className={`h-2 w-full bg-slate-200 rounded-full overflow-hidden ${className}`}
    >
      <div
        className={`h-full bg-blue-600 rounded-full transition-all duration-200 ${indefinido ? 'animate-pulse' : ''}`}
        style={{ width: indefinido ? '12%' : `${Math.max(4, progresso.pct ?? 0)}%` }}
      />
    </div>
  );
};

function useEsperaLonga(progresso: ProgressoDoAcesso, limiteMs: number): boolean {
  const [longa, setLonga] = useState(false);
  useEffect(() => {
    if (!progresso.ativo || !progresso.desde) {
      setLonga(false);
      return;
    }
    const falta = progresso.desde + limiteMs - Date.now();
    if (falta <= 0) {
      setLonga(true);
      return;
    }
    setLonga(false);
    const t = setTimeout(() => setLonga(true), falta);
    return () => clearTimeout(t);
  }, [progresso.ativo, progresso.desde, limiteMs]);
  return longa;
}

export const TelaDeCarga: React.FC<{ titulo: string }> = ({ titulo }) => {
  const progresso = useProgressoDoAcesso();
  const demorando = useEsperaLonga(progresso, 10000);
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-white text-slate-800 p-6">
      <div className="w-full max-w-xs text-center space-y-3">
        <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-medium text-slate-700">{titulo}</p>
        {progresso.ativo && (
          <div className="space-y-1.5" role="status">
            <BarraDeProgresso progresso={progresso} />
            <p className="text-xs text-slate-600 font-mono tabular-nums">
              {textoDoProgresso(progresso)}
              {!progresso.esperandoServico && progresso.total > 0 ? ` (${mb(progresso.recebidos)} de ${mb(progresso.total)} MB)` : ''}
            </p>
            {demorando && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                O serviço de acesso está demorando mais que o normal. O app continua tentando; não precisa recarregar.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const AvisoDeCarga: React.FC = () => {
  const progresso = useProgressoDoAcesso();
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    if (!progresso.ativo) {
      setVisivel(false);
      return;
    }
    const t = setTimeout(() => setVisivel(true), 500);
    return () => clearTimeout(t);
  }, [progresso.ativo]);

  if (!progresso.ativo || !visivel) return null;
  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] w-[min(20rem,calc(100vw-2rem))] px-3 py-2 bg-white border border-blue-300 rounded-xl shadow-lg space-y-1.5"
    >
      <p className="text-xs font-semibold text-blue-800 font-mono tabular-nums">{textoDoProgresso(progresso)}</p>
      <BarraDeProgresso progresso={progresso} />
    </div>
  );
};
