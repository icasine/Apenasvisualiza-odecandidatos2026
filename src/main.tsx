import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import 'leaflet/dist/leaflet.css';
import './index.css';

class ErroDeTela extends React.Component<{ children: React.ReactNode }, { erro: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { erro: null };
  }
  static getDerivedStateFromError(erro: Error) {
    return { erro };
  }
  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-slate-800">
          <div className="text-lg font-bold">Esta tela encontrou um erro</div>
          <p>Nenhum dado foi apagado. Recarregue para continuar. Se o erro voltar na mesma tela, anote a mensagem abaixo.</p>
          <pre className="text-xs bg-slate-100 border border-slate-200 rounded-lg p-2 whitespace-pre-wrap break-words">{String(this.state.erro.message || this.state.erro)}</pre>
          <button type="button" onClick={() => window.location.reload()} className="h-11 px-4 rounded-lg bg-blue-600 text-white font-semibold cursor-pointer">Recarregar</button>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(<ErroDeTela><App /></ErroDeTela>);
