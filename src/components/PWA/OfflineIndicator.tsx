import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-amber-600/95 border border-amber-500/50 px-3.5 py-2 text-xs font-medium text-slate-900 shadow-xl backdrop-blur-md animate-fade-in">
      <WifiOff className="w-4 h-4 text-amber-800" />
      <span>Modo Offline — exibindo dados locais armazenados em cache.</span>
    </div>
  );
};
