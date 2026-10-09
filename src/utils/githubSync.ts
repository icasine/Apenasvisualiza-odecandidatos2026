
export interface GitHubConfig {
  token: string;
  repo: string;
  branch: string;
}

export interface GitHubApiError extends Error {
  status?: number;
  apiResponse?: any;
  endpoint?: string;
  step?: 'leitura' | 'previa' | 'gravacao';
}

export interface GitHubFileDetails {
  sha: string | null;
  content: string | null;
  exists: boolean;
}

const knownShaMap = new Map<string, string>();

export function base64ToUtf8(b64: string): string {
  const cleanB64 = b64.replace(/\s/g, '');
  const binString = atob(cleanB64);
  const bytes = Uint8Array.from(binString, (m) => m.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export async function getFileDetailsFromGitHub(
  config: GitHubConfig,
  filePath: string
): Promise<GitHubFileDetails> {
  const cleanPath = filePath.replace(/^\//, '');
  const branchParam = encodeURIComponent(config.branch || 'main');
  const timestamp = Date.now();
  const url = `https://api.github.com/repos/${config.repo}/contents/${cleanPath}?ref=${branchParam}&_t=${timestamp}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });

    if (res.status === 200) {
      const data = await res.json();
      const sha = data.sha || null;
      let content: string | null = null;
      if (typeof data.content === 'string' && data.content.length > 0) {
        try {
          content = base64ToUtf8(data.content);
        } catch (e) {
          console.warn(`Erro ao decodificar base64 de ${cleanPath}:`, e);
          content = null;
        }
      } else if (sha && Number(data.size) > 0) {
        content = await lerBlobDoGitHub(config, sha);
      } else if (typeof data.content === 'string') {
        content = '';
      }
      if (sha) {
        knownShaMap.set(cleanPath, sha);
      }
      return { sha, content, exists: true };
    }

    if (res.status === 404) {
      knownShaMap.delete(cleanPath);
      return { sha: null, content: null, exists: false };
    }

    if (res.status === 401 || res.status === 403) {
      const errJson = await res.json().catch(() => ({}));
      const msg = errJson.message || `Erro de autenticação/permissão (HTTP ${res.status})`;
      const err: GitHubApiError = new Error(`Acesso negado ao buscar '${cleanPath}': ${msg}`);
      err.status = res.status;
      err.apiResponse = errJson;
      err.endpoint = url;
      err.step = 'leitura';
      throw err;
    }

    const errOutro: GitHubApiError = new Error(
      `Falha ao consultar '${cleanPath}' no GitHub (HTTP ${res.status}). Nada foi gravado nem apagado.`
    );
    errOutro.status = res.status;
    errOutro.endpoint = url;
    errOutro.step = 'leitura';
    throw errOutro;
  } catch (error: any) {
    if (error.step) throw error;
    const errRede: GitHubApiError = new Error(
      `Falha de rede ao consultar '${cleanPath}' no GitHub. Nada foi gravado nem apagado. Verifique a conexão e tente de novo.`
    );
    errRede.endpoint = url;
    errRede.step = 'leitura';
    throw errRede;
  }
}

export async function lerBlobDoGitHub(config: GitHubConfig, sha: string): Promise<string | null> {
  const url = `https://api.github.com/repos/${config.repo}/git/blobs/${sha}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });
  } catch {
    const errRede: GitHubApiError = new Error('Falha de rede ao ler um arquivo no GitHub. Nada foi gravado nem apagado.');
    errRede.endpoint = url;
    errRede.step = 'leitura';
    throw errRede;
  }
  if (!res.ok) {
    const err: GitHubApiError = new Error(`Falha ao ler um arquivo no GitHub (HTTP ${res.status}).`);
    err.status = res.status;
    err.endpoint = url;
    err.step = 'leitura';
    throw err;
  }
  const data = await res.json();
  if (typeof data.content !== 'string') return null;
  try {
    return data.encoding === 'base64' ? base64ToUtf8(data.content) : data.content;
  } catch {
    return null;
  }
}

export async function fetchFileDirectFromGitHubAPI<T = any>(
  config: GitHubConfig,
  filePath: string
): Promise<T | null> {
  const details = await getFileDetailsFromGitHub(config, filePath);
  if (!details.exists || !details.content) {
    return null;
  }
  try {
    return JSON.parse(details.content) as T;
  } catch (e) {
    console.warn(`Erro ao fazer parse de JSON de ${filePath}:`, e);
    return null;
  }
}

