import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors shadow-sm active:scale-95 whitespace-nowrap"
        title="Instalar como aplicativo no dispositivo"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Instalar App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 transition-colors active:scale-95 whitespace-nowrap"
          title="Instalar no iPhone / iPad"
        >
          <Smartphone className="w-3.5 h-3.5 text-blue-600" />
          <span>Instalar no iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-xl bg-white border border-slate-300 p-6 shadow-2xl text-slate-900">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <h3 className="text-base font-semibold text-slate-900">Instalar no iPhone / iPad</h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-slate-500 hover:text-slate-900"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="mt-4 space-y-3 text-sm text-slate-700">
                <p>
                  1. Toque no botão de <strong>Compartilhar</strong> (ícone de quadrado com seta para cima) na barra do Safari.
                </p>
                <p>
                  2. Role para baixo e selecione <strong>Adicionar à Tela de Início</strong>.
                </p>
                <p>
                  3. Toque em <strong>Adicionar</strong> no canto superior direito.
                </p>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
              >
                Entendi
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
