
import { AdminSession } from '../types/election';

const STORAGE_KEY_SESSION = 'contagem_github_admin_session';
const STORAGE_KEY_TOKEN = 'contagem_github_pat';
const STORAGE_KEY_USER = 'contagem_github_user';
const STORAGE_KEY_REPO = 'contagem_github_repo';
const STORAGE_KEY_BRANCH = 'contagem_github_branch';

const STORAGE_KEY_LEMBRAR = 'contagem_github_lembrar';
const STORAGE_KEY_VALIDADE = 'contagem_github_validade';

function guardaDoToken(): Storage {
  try {
    return localStorage.getItem(STORAGE_KEY_LEMBRAR) === '0' ? sessionStorage : localStorage;
  } catch {
    return localStorage;
  }
}

export function tokenSoNestaAba(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_LEMBRAR) === '0';
  } catch {
    return false;
  }
}

export function definirLembrarToken(lembrar: boolean): void {
  try {
    if (lembrar) localStorage.removeItem(STORAGE_KEY_LEMBRAR);
    else localStorage.setItem(STORAGE_KEY_LEMBRAR, '0');
  } catch {}
}

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

export function tipoDoToken(token: string): 'fine' | 'classico' | 'desconhecido' {
  const t = String(token || '').trim();
  if (t.startsWith('github_pat_')) return 'fine';
  if (t.startsWith('ghp_')) return 'classico';
  return 'desconhecido';
}

export function lerValidadeDoToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY_VALIDADE);
  } catch {
    return null;
  }
}

export function guardarValidadeDoToken(valor: string): void {
  try {
    const limpo = String(valor || '').trim();
    if (!limpo) {
      localStorage.removeItem(STORAGE_KEY_VALIDADE);
      return;
    }
    const data = new Date(limpo.replace(' UTC', 'Z').replace(' ', 'T'));
    if (isNaN(data.getTime())) return;
    localStorage.setItem(STORAGE_KEY_VALIDADE, data.toISOString().slice(0, 10));
  } catch {}
}

export function avisoDeValidadeDoToken(): string | null {
  const validade = lerValidadeDoToken();
  if (!validade) return null;
  const fim = new Date(`${validade}T00:00:00`);
  if (isNaN(fim.getTime())) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dias = Math.round((fim.getTime() - hoje.getTime()) / (24 * 60 * 60 * 1000));
  const dataBR = validade.split('-').reverse().join('/');
  if (dias < 0) return `O token do GitHub venceu em ${dataBR}. Crie um novo token e entre de novo.`;
  if (dias <= 7) return `O token do GitHub vence em ${dataBR} (${dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : `faltam ${dias} dias`}). Crie um novo antes disso.`;
  return null;
}

export function getStoredGitHubUser(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_USER) || '';
  } catch {
    return '';
  }
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

export function saveGitHubCredentials(
  user: string,
  repo: string,
  token: string,
  branch: string = 'main'
): void {
  try {
    localStorage.setItem(STORAGE_KEY_USER, user.trim());
    localStorage.setItem(STORAGE_KEY_REPO, repo.trim());
    localStorage.setItem(STORAGE_KEY_BRANCH, branch.trim() || 'main');
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    sessionStorage.removeItem(STORAGE_KEY_TOKEN);
    guardaDoToken().setItem(STORAGE_KEY_TOKEN, token.trim());
  } catch (e) {
    console.warn('Falha ao salvar credenciais do GitHub no navegador:', e);
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

export function saveAdminSession(session: AdminSession): void {
  try {
    localStorage.removeItem(STORAGE_KEY_SESSION);
    sessionStorage.removeItem(STORAGE_KEY_SESSION);
    guardaDoToken().setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
  } catch (e) {
    console.warn('Falha ao salvar sessão admin:', e);
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

export async function loginWithGitHub(
  userInput: string,
  repoInput: string,
  token: string,
  branchInput: string = 'main'
): Promise<AdminSession> {
  const cleanToken = token.trim();
  if (!cleanToken) {
    throw new Error('Informe o Personal Access Token do GitHub.');
  }

  let fullRepo = repoInput.trim();
  if (userInput.trim() && fullRepo && !fullRepo.includes('/')) {
    fullRepo = `${userInput.trim()}/${fullRepo}`;
  }

  try {
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });

    if (!userRes.ok) {
      if (userRes.status === 401) {
        throw new Error('Token do GitHub inválido, incorreto ou expirado (HTTP 401).');
      }
      throw new Error(`Falha ao validar o token na API do GitHub (HTTP ${userRes.status}).`);
    }

    const userData = await userRes.json();
    const loginUser = userData.login || userInput.trim() || 'Usuário GitHub';

    if (fullRepo && fullRepo.includes('/')) {
      const repoRes = await fetch(`https://api.github.com/repos/${fullRepo}`, {
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      });

      if (!repoRes.ok) {
        if (repoRes.status === 404) {
          throw new Error(
            `Repositório '${fullRepo}' não encontrado ou o token não possui permissão de leitura sobre ele.`
          );
        }
        throw new Error(`Erro ao acessar o repositório '${fullRepo}' no GitHub (HTTP ${repoRes.status}).`);
      }

      const repoData = await repoRes.json();
      if (repoData.permissions && repoData.permissions.push === false) {
        throw new Error(
          `O token possui acesso ao repositório '${fullRepo}', mas NÃO possui permissão de escrita (Contents: read and write).`
        );
      }
    }

    const session: AdminSession = {
      isAuthenticated: true,
      username: `@${loginUser}`,
      loginMethod: 'github_pat',
      loginTime: new Date().toISOString(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000
    };

    saveAdminSession(session);
    saveGitHubCredentials(userInput.trim() || loginUser, fullRepo, cleanToken, branchInput.trim() || 'main');

    return session;
  } catch (err: any) {
    throw new Error(err.message || 'Falha ao autenticar com a API do GitHub.');
  }
}
