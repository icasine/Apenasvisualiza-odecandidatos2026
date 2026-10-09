
import { getStoredGitHubRepo, getStoredGitHubBranch, getStoredGitHubToken } from './adminAuth';
import { fetchFileDirectFromGitHubAPI } from './githubSync';
import { acessoAtivo, lerSessao, buscarArquivoComSessao, OpcoesDeLeitura } from './acesso';

const DEFAULT_REPO = 'icasine/eleicaocontagemcomparativo';

export function getEffectiveRepo(): string {
  const stored = getStoredGitHubRepo();
  if (stored && stored.includes('/')) return stored.trim();

  try {
    const envRepo = (import.meta as any).env?.VITE_GITHUB_REPO;
    if (envRepo) return envRepo.trim();
  } catch {}

  return DEFAULT_REPO;
}

export function getEffectiveBranch(): string {
  return getStoredGitHubBranch() || 'main';
}

const VALIDADE_COMMIT_MS = 30000;
let commitGuardado: { chave: string; sha: string; quando: number } | null = null;
let buscaCommitEmAndamento: Promise<string | null> | null = null;

async function obterCommitAtual(repo: string, branch: string): Promise<string | null> {
  const chave = `${repo}@${branch}`;
  if (commitGuardado && commitGuardado.chave === chave && Date.now() - commitGuardado.quando < VALIDADE_COMMIT_MS) {
    return commitGuardado.sha;
  }
  if (buscaCommitEmAndamento) return buscaCommitEmAndamento;

  buscaCommitEmAndamento = (async () => {
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(branch)}`, {
        cache: 'no-store',
        headers: { Accept: 'application/vnd.github.sha' }
      });
      if (!res.ok) return null;
      const sha = (await res.text()).trim();
      if (!/^[0-9a-f]{40}$/.test(sha)) return null;
      commitGuardado = { chave, sha, quando: Date.now() };
      return sha;
    } catch {
      return null;
    } finally {
      buscaCommitEmAndamento = null;
    }
  })();

  return buscaCommitEmAndamento;
}

async function lerJson<T>(url: string): Promise<{ dados: T | null; naoExiste: boolean }> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (res.status === 404) return { dados: null, naoExiste: true };
    if (!res.ok) return { dados: null, naoExiste: false };
    return { dados: (await res.json()) as T, naoExiste: false };
  } catch {
    return { dados: null, naoExiste: false };
  }
}

export async function fetchDataFile<T = any>(relativePath: string, opcoes: OpcoesDeLeitura = {}): Promise<T | null> {
  const cleanPath = relativePath.replace(/^\.?\//, '').replace(/^public\//, '');
  const repo = getEffectiveRepo();
  const branch = getEffectiveBranch();
  const token = getStoredGitHubToken();

  if (acessoAtivo()) {
    const sessao = lerSessao();
    if (!sessao) return null;
    if (token && sessao.perfil === 'edicao' && repo && repo.includes('/')) {
      try {
        const viaApi = await fetchFileDirectFromGitHubAPI<T>({ repo, token, branch }, `public/${cleanPath}`);
        if (viaApi) return viaApi;
      } catch (e) {
        console.warn(`Leitura de ${cleanPath} pela API falhou; tentando pelo serviço de acesso:`, e);
      }
    }
    return buscarArquivoComSessao<T>(cleanPath, opcoes);
  }

  if (repo && repo.includes('/')) {
    if (token) {
      try {
        const viaApi = await fetchFileDirectFromGitHubAPI<T>({ repo, token, branch }, `public/${cleanPath}`);
        if (viaApi) return viaApi;
      } catch (e) {
        console.warn(`Leitura de ${cleanPath} pela API falhou; tentando a leitura pública:`, e);
      }
    }

    const sha = await obterCommitAtual(repo, branch);
    if (sha) {
      const doCommit = await lerJson<T>(`https://raw.githubusercontent.com/${repo}/${sha}/public/${cleanPath}`);
      if (doCommit.dados) return doCommit.dados;
      if (doCommit.naoExiste) return null;
    }

    const doBranch = await lerJson<T>(
      `https://raw.githubusercontent.com/${repo}/${branch}/public/${cleanPath}?_t=${Date.now()}`
    );
    if (doBranch.dados) return doBranch.dados;
  }

  const localUrls = [`/${cleanPath}`, `./${cleanPath}`];
  for (const url of localUrls) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (res.ok) {
        const data = await res.json();
        return data as T;
      }
    } catch {}
  }
  return null;
}

export async function fetchDataFileDirectFromAPI<T = any>(relativePath: string): Promise<T | null> {
  return fetchDataFile<T>(relativePath);
}
