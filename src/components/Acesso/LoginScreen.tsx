import React, { useState } from 'react';
import { Lock, User, Eye, EyeOff, LogIn } from 'lucide-react';
import { entrarNoAcesso } from '../../utils/acesso';

export const LoginScreen: React.FC = () => {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const aoEnviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (entrando) return;
    setErro(null);
    if (!usuario.trim() || !senha) {
      setErro('Informe usuário e senha.');
      return;
    }
    setEntrando(true);
    try {
      await entrarNoAcesso(usuario, senha);
      window.location.reload();
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível entrar.');
      setEntrando(false);
    }
  };

  return (
    <div className="min-h-dvh w-full flex items-center justify-center bg-slate-50 text-slate-900 p-4">
      <form
        onSubmit={aoEnviar}
        className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-lg p-6 space-y-5"
      >
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold text-slate-900">Mapa Eleitoral Contagem</h1>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Usuário</span>
          <div className="relative">
            <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="w-full h-12 pl-9 pr-3 bg-white border border-slate-300 rounded-lg text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Senha</span>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type={mostrarSenha ? 'text' : 'password'}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
              className="w-full h-12 pl-9 pr-12 bg-white border border-slate-300 rounded-lg text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => setMostrarSenha(!mostrarSenha)}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-slate-500 hover:text-slate-800 rounded-lg cursor-pointer"
              aria-label={mostrarSenha ? 'Esconder senha' : 'Mostrar senha'}
            >
              {mostrarSenha ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </label>

        {erro && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm" role="alert">
            {erro}
          </div>
        )}

        <button
          type="submit"
          disabled={entrando}
          className="w-full h-12 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded-xl text-sm font-bold shadow-md transition active:scale-95 cursor-pointer"
        >
          <LogIn className="w-5 h-5" />
          <span>{entrando ? 'Entrando...' : 'Entrar'}</span>
        </button>

        <p className="text-xs text-slate-500 text-center">
          Se esqueceu a senha, fale com o responsável pelo mapa.
        </p>
      </form>
    </div>
  );
};
