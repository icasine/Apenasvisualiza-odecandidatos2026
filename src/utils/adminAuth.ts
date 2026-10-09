
import { AdminSession } from '../types/election';

const STORAGE_KEY_SESSION = 'contagem_github_admin_session';
const STORAGE_KEY_TOKEN = 'contagem_github_pat';
const STORAGE_KEY_REPO = 'contagem_github_repo';
const STORAGE_KEY_BRANCH = 'contagem_github_branch';

function lerDasDuasGuardas(chave: string): string | null {
  try {
    return sessionStorage.getItem(chave) || localStorage.getItem(chave);
  } catch {
    return null;
  }
}

export function getStoredGitHubToken(): string | null {
  return lerDasDuasGuardas(STORAGE_KEY_TOKEN);
}

export function getStoredGitHubRepo(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_REPO) || '';
  } catch {
    return '';
  }
}

export function getStoredGitHubBranch(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_BRANCH) || 'main';
  } catch {
    return 'main';
  }
}

export function getAdminSession(): AdminSession | null {
  try {
    const raw = lerDasDuasGuardas(STORAGE_KEY_SESSION);
    if (!raw) return null;

    const session: AdminSession = JSON.parse(raw);
    if (Date.now() > session.expiresAt || !getStoredGitHubToken()) {
      logoutAdmin();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function logoutAdmin(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_SESSION);
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    sessionStorage.removeItem(STORAGE_KEY_SESSION);
    sessionStorage.removeItem(STORAGE_KEY_TOKEN);
  } catch (e) {
    console.warn('Falha ao deslogar:', e);
  }
}

