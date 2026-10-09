import React from 'react';
import { Map, Table2, Database, Filter, Globe, LogOut, Users, MapPinned, Flag, Megaphone, ClipboardList } from 'lucide-react';
import { FilterState } from '../../types/election';
import { PWAInstallButton } from '../PWA/PWAInstallButton';
import { podeVerArea } from '../../utils/acesso';

interface NavbarProps {
  currentTab: FilterState['tab'];
  onTabChange: (tab: FilterState['tab']) => void;
  onToggleFiltersMobile: () => void;
  candidatosCount: number;
  isDarkMode?: boolean;
  onToggleTheme?: () => void;
  isAdminAuthenticated?: boolean;
  mostrarGestao?: boolean;
  usuarioNome?: string;
  onSair?: () => void;
  compacto?: boolean;
}

const classeAba = (ativa: boolean) =>
  `flex-1 lg:flex-none flex items-center justify-center gap-1.5 px-2 sm:px-3 py-2 lg:py-1.5 text-xs sm:text-sm font-semibold whitespace-nowrap rounded-lg transition-colors cursor-pointer ${
    ativa
      ? 'text-slate-900 bg-slate-100 border border-slate-300'
      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-transparent'
  }`;

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onTabChange,
  onToggleFiltersMobile,
  candidatosCount,
  isAdminAuthenticated = false,
  mostrarGestao = true,
  usuarioNome,
  onSair,
  compacto = false
}) => {
  const mostraBotaoCandidatos = currentTab === 'mapa' || currentTab === 'tabela';

  if (compacto) {
    const icone = (ativa: boolean) =>
      `w-9 h-9 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${ativa ? 'text-slate-900 bg-slate-100 border border-slate-300' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`;
    return (
      <nav className="flex items-center gap-0.5" aria-label="Navegação">
        {mostraBotaoCandidatos && (
          <button onClick={onToggleFiltersMobile} className="lg:hidden relative w-9 h-9 flex items-center justify-center rounded-lg text-blue-700 bg-blue-50 border border-blue-200 cursor-pointer" title="Candidatos" aria-label="Candidatos">
            <Filter className="w-4 h-4" />
            {candidatosCount > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-blue-600 text-white text-[10px] leading-4 text-center">{candidatosCount}</span>}
          </button>
        )}
        <button onClick={() => onTabChange('mapa')} className={icone(currentTab === 'mapa')} title="Mapa" aria-label="Mapa"><Map className="w-4 h-4" /></button>
        <button onClick={() => onTabChange('tabela')} className={icone(currentTab === 'tabela')} title="Tabela" aria-label="Tabela"><Table2 className="w-4 h-4" /></button>
        <button onClick={() => onTabChange('minas')} className={icone(currentTab === 'minas')} title="Minas" aria-label="Minas"><Globe className="w-4 h-4" /></button>
        {onSair && (
          <button onClick={onSair} className={icone(false)} title={usuarioNome ? `Sair (${usuarioNome})` : 'Sair'} aria-label="Sair"><LogOut className="w-4 h-4" /></button>
        )}
      </nav>
    );
  }

  return (
    <header className="min-h-14 py-1.5 lg:py-0 border-b border-slate-200 bg-white/95 backdrop-blur-md px-3 sm:px-6 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 z-30 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={() => onTabChange('mapa')}
          className="text-left font-bold text-base sm:text-lg tracking-tight whitespace-nowrap text-slate-900 hover:text-blue-600 transition-colors cursor-pointer"
        >
          Mapa Eleitoral Contagem
        </button>

        {mostraBotaoCandidatos && (
          <button
            onClick={onToggleFiltersMobile}
            className="lg:hidden flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md border border-slate-300 transition cursor-pointer"
          >
            <Filter className="w-3.5 h-3.5 text-blue-600" />
            <span>Candidatos</span>
            {candidatosCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center font-bold">
                {candidatosCount}
              </span>
            )}
          </button>
        )}
      </div>

      <nav className="order-3 w-full lg:order-none lg:w-auto flex items-center gap-1 sm:gap-2">
        <button onClick={() => onTabChange('mapa')} className={classeAba(currentTab === 'mapa')}>
          <Map className="w-4 h-4 text-blue-600" />
          <span>Mapa</span>
        </button>

        <button onClick={() => onTabChange('tabela')} className={classeAba(currentTab === 'tabela')}>
          <Table2 className="w-4 h-4 text-emerald-600" />
          <span>Tabela</span>
        </button>

        <button onClick={() => onTabChange('minas')} className={classeAba(currentTab === 'minas')}>
          <Globe className="w-4 h-4 text-amber-600" />
          <span>Minas</span>
        </button>

      </nav>

      <div className="flex items-center gap-2">
        {usuarioNome && (
          <span className="hidden sm:inline text-xs text-slate-500 max-w-[10rem] truncate" title={usuarioNome}>
            {usuarioNome}
          </span>
        )}
        {usuarioNome && onSair && (
          <button
            onClick={onSair}
            className="flex items-center gap-1.5 h-9 px-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition cursor-pointer"
            title={`Sair (${usuarioNome})`}
          >
            <LogOut className="w-4 h-4" />
            <span>Sair</span>
          </button>
        )}
        <PWAInstallButton />
      </div>
    </header>
  );
};
