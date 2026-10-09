import { useSyncExternalStore } from 'react';
import { haDadosNovosNoAcesso, lerProgressoDoAcesso, ouvirAcesso, ProgressoDoAcesso } from '../utils/acesso';

export function useProgressoDoAcesso(): ProgressoDoAcesso {
  return useSyncExternalStore(ouvirAcesso, lerProgressoDoAcesso);
}

export function useDadosNovosNoAcesso(): boolean {
  return useSyncExternalStore(ouvirAcesso, haDadosNovosNoAcesso);
}
