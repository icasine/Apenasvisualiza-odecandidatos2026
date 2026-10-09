
const NOME_DO_BANCO = 'contagem_copia_local';
const NOME_DA_TABELA = 'arquivos';
const NOME_DOS_AVULSOS = 'avulsos';

export interface ArquivoGuardado {
  caminho: string;
  dono: string;
  texto: string | null;
  quando: number;
}

function abrirBanco(): Promise<IDBDatabase | null> {
  return new Promise((resolver) => {
    try {
      if (typeof indexedDB === 'undefined') return resolver(null);
      const pedido = indexedDB.open(NOME_DO_BANCO, 2);
      pedido.onupgradeneeded = () => {
        if (!pedido.result.objectStoreNames.contains(NOME_DA_TABELA)) {
          pedido.result.createObjectStore(NOME_DA_TABELA, { keyPath: 'caminho' });
        }
        if (!pedido.result.objectStoreNames.contains(NOME_DOS_AVULSOS)) {
          pedido.result.createObjectStore(NOME_DOS_AVULSOS);
        }
      };
      pedido.onsuccess = () => resolver(pedido.result);
      pedido.onerror = () => resolver(null);
      pedido.onblocked = () => resolver(null);
    } catch {
      resolver(null);
    }
  });
}

function concluir(transacao: IDBTransaction, banco: IDBDatabase): Promise<void> {
  return new Promise((resolver) => {
    const fim = () => {
      try {
        banco.close();
      } catch {}
      resolver();
    };
    transacao.oncomplete = fim;
    transacao.onerror = fim;
    transacao.onabort = fim;
  });
}

export async function lerCopiaLocal(dono: string): Promise<ArquivoGuardado[]> {
  const banco = await abrirBanco();
  if (!banco) return [];
  try {
    const transacao = banco.transaction(NOME_DA_TABELA, 'readwrite');
    const tabela = transacao.objectStore(NOME_DA_TABELA);
    const todos: ArquivoGuardado[] = await new Promise((resolver) => {
      const pedido = tabela.getAll();
      pedido.onsuccess = () => resolver((pedido.result || []) as ArquivoGuardado[]);
      pedido.onerror = () => resolver([]);
    });
    const deOutro = todos.some((a) => a.dono !== dono);
    if (deOutro) tabela.clear();
    await concluir(transacao, banco);
    return deOutro ? [] : todos;
  } catch {
    return [];
  }
}

export async function guardarNaCopiaLocal(dono: string, arquivos: Array<{ caminho: string; texto: string | null }>): Promise<void> {
  if (arquivos.length === 0) return;
  const banco = await abrirBanco();
  if (!banco) return;
  try {
    const transacao = banco.transaction(NOME_DA_TABELA, 'readwrite');
    const tabela = transacao.objectStore(NOME_DA_TABELA);
    const quando = Date.now();
    arquivos.forEach((a) => tabela.put({ caminho: a.caminho, dono, texto: a.texto, quando }));
    await concluir(transacao, banco);
  } catch {}
}

export async function apagarCopiaLocal(): Promise<void> {
  const banco = await abrirBanco();
  if (!banco) return;
  try {
    const transacao = banco.transaction(NOME_DA_TABELA, 'readwrite');
    transacao.objectStore(NOME_DA_TABELA).clear();
    await concluir(transacao, banco);
  } catch {}
}

export async function lerAvulsoDoAparelho(chave: string): Promise<string | null> {
  const banco = await abrirBanco();
  if (!banco) return null;
  try {
    const transacao = banco.transaction(NOME_DOS_AVULSOS, 'readonly');
    const pedido = transacao.objectStore(NOME_DOS_AVULSOS).get(chave);
    const valor: string | null = await new Promise((resolver) => {
      pedido.onsuccess = () => resolver(typeof pedido.result === 'string' ? pedido.result : null);
      pedido.onerror = () => resolver(null);
    });
    try {
      banco.close();
    } catch {}
    return valor;
  } catch {
    return null;
  }
}

export async function guardarAvulsoNoAparelho(chave: string, texto: string): Promise<void> {
  const banco = await abrirBanco();
  if (!banco) return;
  try {
    const transacao = banco.transaction(NOME_DOS_AVULSOS, 'readwrite');
    transacao.objectStore(NOME_DOS_AVULSOS).put(texto, chave);
    await concluir(transacao, banco);
  } catch {}
}
