
export interface GitHubConfig {
  token: string;
  repo: string;
  branch: string;
}

export interface CommitFilePayload {
  path: string;
  content: string;
  message: string;
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

export interface CommitFileOptions {
  maxRetries?: number;
  contentUpdater?: (remoteContent: string | null) => string;
}

export interface OperacaoArquivo {
  id: string;
  caminho: string;
  descricao: string;
  executar: () => Promise<void>;
  status: 'pendente' | 'executando' | 'sucesso' | 'erro';
  erroMsg?: string;
  statusHttp?: number;
  respostaApi?: any;
}

const knownShaMap = new Map<string, string>();

export function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  const binString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binString);
}

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
      anotarValidadeDoToken(res);
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

let validadeDoTokenLida: string | null = null;

function anotarValidadeDoToken(res: Response): void {
  try {
    const valor = res.headers.get('github-authentication-token-expiration');
    if (valor) validadeDoTokenLida = valor;
  } catch {}
}

export function obterValidadeDoTokenLida(): string | null {
  return validadeDoTokenLida;
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

export interface ArquivoDaArvore {
  caminho: string;
  sha: string;
  tamanho: number;
}

export async function listarArquivosDoGitHub(
  config: GitHubConfig,
  prefixo: string = 'public/data/'
): Promise<{ arquivos: ArquivoDaArvore[]; incompleta: boolean }> {
  const url = `https://api.github.com/repos/${config.repo}/git/trees/${encodeURIComponent(
    config.branch || 'main'
  )}?recursive=1&_t=${Date.now()}`;
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
    const errRede: GitHubApiError = new Error('Falha de rede ao listar os arquivos no GitHub. Verifique a conexão e tente de novo.');
    errRede.endpoint = url;
    errRede.step = 'leitura';
    throw errRede;
  }
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    const err: GitHubApiError = new Error(
      `Falha ao listar os arquivos no GitHub (HTTP ${res.status}): ${errJson.message || 'sem detalhes'}`
    );
    err.status = res.status;
    err.apiResponse = errJson;
    err.endpoint = url;
    err.step = 'leitura';
    throw err;
  }
  const data = await res.json();
  const arquivos: ArquivoDaArvore[] = (Array.isArray(data.tree) ? data.tree : [])
    .filter((n: any) => n && n.type === 'blob' && typeof n.path === 'string' && n.path.startsWith(prefixo))
    .map((n: any) => ({ caminho: n.path, sha: n.sha, tamanho: Number(n.size) || 0 }));
  return { arquivos, incompleta: Boolean(data.truncated) };
}

export async function getFileSha(config: GitHubConfig, filePath: string): Promise<string | null> {
  const details = await getFileDetailsFromGitHub(config, filePath);
  return details.sha;
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

export async function commitFileToGitHub(
  config: GitHubConfig,
  file: CommitFilePayload,
  options?: CommitFileOptions
): Promise<{ success: boolean; message: string; sha?: string }> {
  const cleanPath = file.path.replace(/^\//, '');
  const maxRetries = options?.maxRetries ?? 3;
  let ultimoErro: GitHubApiError | null = null;

  for (let tentativa = 1; tentativa <= maxRetries + 1; tentativa++) {
    const details = await getFileDetailsFromGitHub(config, cleanPath);
    const existingSha = details.sha;

    if (options?.contentUpdater && details.exists && details.content === null) {
      const errLeitura: GitHubApiError = new Error(
        `Não foi possível ler o conteúdo atual de '${cleanPath}' no GitHub. Nada foi gravado.`
      );
      errLeitura.step = 'leitura';
      throw errLeitura;
    }

    const finalContent = options?.contentUpdater
      ? options.contentUpdater(details.content)
      : file.content;

    const base64Content = utf8ToBase64(finalContent);
    const body: Record<string, any> = {
      message: file.message,
      content: base64Content,
      branch: config.branch || 'main'
    };

    if (existingSha) {
      body.sha = existingSha;
    }

    const url = `https://api.github.com/repos/${config.repo}/contents/${cleanPath}`;

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (res.ok) {
      const resData = await res.json().catch(() => ({}));
      const novoSha = resData?.content?.sha || resData?.commit?.sha;

      if (novoSha) {
        knownShaMap.set(cleanPath, novoSha);
      }

      return {
        success: true,
        message: `Arquivo ${cleanPath} atualizado com sucesso no GitHub!`,
        sha: novoSha
      };
    }

    const errorJson = await res.json().catch(() => ({}));
    const errorMsg = errorJson.message || `Erro HTTP ${res.status}`;
    const err: GitHubApiError = new Error(`Falha ao gravar '${cleanPath}' no GitHub: ${errorMsg}`);
    err.status = res.status;
    err.apiResponse = errorJson;
    err.endpoint = url;
    err.step = 'gravacao';
    ultimoErro = err;

    const isShaConflict =
      res.status === 409 ||
      res.status === 422 ||
      errorMsg.toLowerCase().includes('does not match') ||
      errorMsg.toLowerCase().includes('is at') ||
      errorMsg.toLowerCase().includes('sha');

    if (res.status >= 500 && tentativa <= 3) {
      console.warn(`[GitHubSync] GitHub respondeu HTTP ${res.status} para '${cleanPath}'. Nova tentativa automática ${tentativa} de 3...`);
      await new Promise((resolve) => setTimeout(resolve, 2000 * tentativa));
      continue;
    }

    if (isShaConflict && tentativa <= maxRetries) {
      console.warn(
        `[GitHubSync] Conflito de SHA ao gravar '${cleanPath}' (HTTP ${res.status}). ` +
        `Tentativa ${tentativa} de ${maxRetries}. Aguardando 1s para rebuscar SHA atualizado...`
      );
      knownShaMap.delete(cleanPath);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }

    throw err;
  }

  throw ultimoErro || new Error(`Falha ao gravar '${cleanPath}' após tentativas.`);
}

export async function deleteFileFromGitHub(
  config: GitHubConfig,
  filePath: string,
  message: string,
  maxRetries = 3
): Promise<{ success: boolean; message: string }> {
  const cleanPath = filePath.replace(/^\//, '');
  let ultimoErro: GitHubApiError | null = null;

  for (let tentativa = 1; tentativa <= maxRetries + 1; tentativa++) {
    const details = await getFileDetailsFromGitHub(config, cleanPath);
    if (!details.exists || !details.sha) {
      knownShaMap.delete(cleanPath);
      return {
        success: true,
        message: `Arquivo ${cleanPath} já não existia no repositório.`
      };
    }

    const url = `https://api.github.com/repos/${config.repo}/contents/${cleanPath}`;
    const body = {
      message,
      sha: details.sha,
      branch: config.branch || 'main'
    };

    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (res.ok) {
      knownShaMap.delete(cleanPath);
      return {
        success: true,
        message: `Arquivo ${cleanPath} excluído com sucesso do GitHub!`
      };
    }

    const errorJson = await res.json().catch(() => ({}));
    const errorMsg = errorJson.message || `Erro HTTP ${res.status}`;
    const err: GitHubApiError = new Error(`Falha ao excluir '${cleanPath}' do GitHub: ${errorMsg}`);
    err.status = res.status;
    err.apiResponse = errorJson;
    err.endpoint = url;
    err.step = 'gravacao';
    ultimoErro = err;

    const isShaConflict =
      res.status === 409 ||
      res.status === 422 ||
      errorMsg.toLowerCase().includes('does not match') ||
      errorMsg.toLowerCase().includes('sha');

    if (res.status >= 500 && tentativa <= 3) {
      console.warn(`[GitHubSync] GitHub respondeu HTTP ${res.status} para '${cleanPath}'. Nova tentativa automática ${tentativa} de 3...`);
      await new Promise((resolve) => setTimeout(resolve, 2000 * tentativa));
      continue;
    }

    if (isShaConflict && tentativa <= maxRetries) {
      console.warn(
        `[GitHubSync] Conflito de SHA ao excluir '${cleanPath}' (HTTP ${res.status}). ` +
        `Tentativa ${tentativa} de ${maxRetries}. Aguardando 1s para rebuscar SHA atualizado...`
      );
      knownShaMap.delete(cleanPath);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }

    throw err;
  }

  throw ultimoErro || new Error(`Falha ao excluir '${cleanPath}' após tentativas.`);
}

export async function executarOperacoesEmSequencia(
  operacoes: OperacaoArquivo[],
  onProgresso?: (lista: OperacaoArquivo[]) => void
): Promise<{ todasSucesso: boolean; falhas: OperacaoArquivo[] }> {
  for (let i = 0; i < operacoes.length; i++) {
    const op = operacoes[i];

    if (op.status === 'sucesso') {
      continue;
    }

    op.status = 'executando';
    op.erroMsg = undefined;
    op.statusHttp = undefined;
    op.respostaApi = undefined;
    onProgresso?.([...operacoes]);

    try {
      await op.executar();
      op.status = 'sucesso';
      onProgresso?.([...operacoes]);
    } catch (err: any) {
      op.status = 'erro';
      op.erroMsg = err.message || 'Erro desconhecido na gravação do arquivo.';
      op.statusHttp = err.status;
      op.respostaApi = err.apiResponse;
      onProgresso?.([...operacoes]);

      const falhas = operacoes.filter((o) => o.status === 'erro' || o.status === 'pendente');
      return { todasSucesso: false, falhas };
    }
  }

  const falhas = operacoes.filter((o) => o.status !== 'sucesso');
  return { todasSucesso: falhas.length === 0, falhas };
}
