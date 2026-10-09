
import { URL_ACESSO } from '../config';
import { apagarCopiaLocal, guardarNaCopiaLocal, lerCopiaLocal } from './copiaLocal';

export type PerfilAcesso = 'edicao' | 'consulta';

export interface SessaoAcesso {
  usuario: string;
  nome: string;
  perfil: PerfilAcesso;
  candidatos: string[] | 'TODOS';
  ver?: string[] | 'TODOS';
  inserir?: string[] | 'TODOS';
  aprovacao?: boolean;
  sessao: string;
  expiraEm: number;
}

const CHAVE_SESSAO = 'contagem_sessao_acesso';

export function acessoAtivo(): boolean {
  return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(String(URL_ACESSO || '').trim());
}

export function lerSessao(): SessaoAcesso | null {
  if (!acessoAtivo()) return null;
  try {
    const bruto = localStorage.getItem(CHAVE_SESSAO);
    if (!bruto) return null;
    const s = JSON.parse(bruto) as SessaoAcesso;
    if (!s || !s.sessao || !s.usuario || Date.now() > Number(s.expiraEm)) {
      localStorage.removeItem(CHAVE_SESSAO);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function sairDoAcesso(): void {
  try {
    localStorage.removeItem(CHAVE_SESSAO);
  } catch {}
  limparCopiasDoAcesso();
}

export function podeEditarDados(): boolean {
  if (!acessoAtivo()) return true;
  return lerSessao()?.perfil === 'edicao';
}

async function chamarScript(corpo: Record<string, unknown>): Promise<any> {
  const res = await fetch(String(URL_ACESSO).trim(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(corpo),
    redirect: 'follow'
  });
  if (!res.ok) {
    throw new Error(`O serviço de acesso respondeu com erro (HTTP ${res.status}).`);
  }
  return res.json();
}

export async function entrarNoAcesso(usuario: string, senha: string): Promise<SessaoAcesso> {
  let resposta: any;
  try {
    resposta = await chamarScript({ acao: 'entrar', usuario: usuario.trim(), senha });
  } catch (e: any) {
    throw new Error(e?.message || 'Não foi possível falar com o serviço de acesso. Verifique a internet e tente de novo.');
  }
  if (!resposta || !resposta.ok) {
    throw new Error(resposta?.erro || 'Usuário ou senha incorretos.');
  }
  const u = resposta.usuario || {};
  const sessao: SessaoAcesso = {
    usuario: String(u.usuario || usuario).trim(),
    nome: String(u.nome || u.usuario || usuario).trim(),
    perfil: u.perfil === 'edicao' ? 'edicao' : 'consulta',
    candidatos: u.candidatos === 'TODOS' ? 'TODOS' : Array.isArray(u.candidatos) ? u.candidatos.map(String) : [],
    sessao: String(resposta.sessao),
    expiraEm: Number(resposta.expiraEm) || Date.now() + 12 * 60 * 60 * 1000,
    ...permissoesDe(u)
  };
  localStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao));
  return sessao;
}

const CHAVE_LOTE = 'contagem_acesso_lote';
const ESPERA_DO_LOTE_MS = 30;
const MAXIMO_POR_LOTE = 12;
const LIMITE_VARIOS_ARQUIVOS_MS = 15000;
const LIMITE_UM_ARQUIVO_MS = 60000;

export interface OpcoesDeLeitura {
  silencioso?: boolean;
}

export interface ProgressoDoAcesso {
  ativo: boolean;
  esperandoServico: boolean;
  recebidos: number;
  total: number;
  pct: number | null;
  desde: number;
}

const SEM_PROGRESSO: ProgressoDoAcesso = { ativo: false, esperandoServico: false, recebidos: 0, total: 0, pct: null, desde: 0 };
let esperaDesde = 0;
let progresso: ProgressoDoAcesso = SEM_PROGRESSO;
let haDadosNovos = false;
const ouvintes = new Set<() => void>();
const transferencias = new Map<number, { recebidos: number; total: number }>();
let contadorDeTransferencias = 0;
let ondaTotal = 0;
let ondaFeitas = 0;

export function ouvirAcesso(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}
export const lerProgressoDoAcesso = (): ProgressoDoAcesso => progresso;
export const haDadosNovosNoAcesso = (): boolean => haDadosNovos;

function avisarOuvintes() {
  ouvintes.forEach((f) => {
    try {
      f();
    } catch {}
  });
}

function atualizarProgresso() {
  if (transferencias.size === 0) {
    progresso = SEM_PROGRESSO;
    ondaTotal = 0;
    ondaFeitas = 0;
    esperaDesde = 0;
  } else {
    if (!esperaDesde) esperaDesde = Date.now();
    let recebidos = 0;
    let total = 0;
    let fracaoDasAtivas = 0;
    transferencias.forEach((t) => {
      recebidos += t.recebidos;
      total += t.total;
      if (t.total > 0) fracaoDasAtivas += Math.min(1, t.recebidos / t.total);
    });
    const andamento = ondaTotal > 0 ? (ondaFeitas + fracaoDasAtivas) / ondaTotal : 0;
    const semMedida = ondaTotal === 1 && total === 0;
    progresso = {
      ativo: true,
      esperandoServico: recebidos === 0 && ondaFeitas === 0,
      recebidos,
      total,
      pct: semMedida ? null : Math.max(0, Math.min(99, Math.floor(andamento * 100))),
      desde: esperaDesde
    };
  }
  avisarOuvintes();
}

async function chamarScriptComAndamento(corpo: Record<string, unknown>, visivel: boolean, limiteMs: number = LIMITE_UM_ARQUIVO_MS): Promise<any> {
  const id = ++contadorDeTransferencias;
  const cancelador = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const relogio = cancelador ? setTimeout(() => cancelador.abort(), limiteMs) : null;
  const registro = { recebidos: 0, total: 0 };
  if (visivel) {
    ondaTotal++;
    transferencias.set(id, registro);
    atualizarProgresso();
  }
  try {
    const res = await fetch(String(URL_ACESSO).trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(corpo),
      redirect: 'follow',
      signal: cancelador ? cancelador.signal : undefined
    });
    if (!res.ok) throw new Error(`O serviço de acesso respondeu com erro (HTTP ${res.status}).`);
    const leitor = res.body && typeof res.body.getReader === 'function' ? res.body.getReader() : null;
    if (!leitor) return await res.json();

    const partes: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      if (!value || value.length === 0) continue;
      partes.push(value);
      registro.recebidos += value.length;
      if (registro.total === 0 && partes.length === 1) {
        const comeco = new TextDecoder().decode(value.subarray(0, 120));
        const achado = /"bytes":(\d+)/.exec(comeco);
        if (achado) registro.total = Number(achado[1]) + 40;
      }
      if (visivel) atualizarProgresso();
    }
    const tudo = new Uint8Array(registro.recebidos);
    let posicao = 0;
    partes.forEach((p) => {
      tudo.set(p, posicao);
      posicao += p.length;
    });
    return JSON.parse(new TextDecoder('utf-8').decode(tudo));
  } finally {
    if (relogio) clearTimeout(relogio);
    if (visivel) {
      transferencias.delete(id);
      ondaFeitas++;
      atualizarProgresso();
    }
  }
}

const memoria = new Map<string, string | null>();
const vindosDoAparelho = new Set<string>();
let donoAtual = '';
let aGravar: Array<{ caminho: string; texto: string | null }> = [];
let temporizadorDeGravar: ReturnType<typeof setTimeout> | null = null;

function donoDaSessao(s: SessaoAcesso): string {
  const lista = s.candidatos === 'TODOS' ? 'TODOS' : [...s.candidatos].sort().join(',');
  return `${s.usuario}|${s.perfil}|${lista}`;
}

function gravarNoAparelho(arquivos: Array<{ caminho: string; texto: string | null }>) {
  if (!donoAtual || arquivos.length === 0) return;
  aGravar.push(...arquivos);
  if (temporizadorDeGravar) return;
  temporizadorDeGravar = setTimeout(() => {
    temporizadorDeGravar = null;
    const lote = aGravar;
    aGravar = [];
    void guardarNaCopiaLocal(donoAtual, lote);
  }, 250);
}

function lembrar(caminho: string, conteudo: unknown) {
  const texto = conteudo === null || conteudo === undefined ? null : JSON.stringify(conteudo);
  memoria.set(caminho, texto);
  gravarNoAparelho([{ caminho, texto }]);
}

const respostaDeArquivoValida = (r: any): boolean => Boolean(r && r.ok === true && typeof r.existe === 'boolean');
const mapaDeArquivosValido = (resposta: any): boolean =>
  Boolean(resposta && resposta.ok === true && resposta.arquivos && typeof resposta.arquivos === 'object' && !Array.isArray(resposta.arquivos));

function lembrarResposta(caminho: string, r: any): boolean {
  if (!respostaDeArquivoValida(r)) return false;
  lembrar(caminho, r.existe === false ? null : r.conteudo ?? null);
  return true;
}

export function limparCopiasDoAcesso(): void {
  memoria.clear();
  vindosDoAparelho.clear();
  aGravar = [];
  haDadosNovos = false;
  void apagarCopiaLocal();
}

export async function limparCacheDoServico(): Promise<boolean> {
  const s = lerSessao();
  if (!s || s.perfil !== 'edicao') return false;
  const limite = new Promise<boolean>((resolver) => setTimeout(() => resolver(false), 10000));
  const pedido = chamarScript({ acao: 'limpar_cache', sessao: s.sessao })
    .then((r) => Boolean(r && r.ok))
    .catch(() => false);
  return Promise.race([pedido, limite]);
}

export async function atualizarDadosDoAcesso(): Promise<void> {
  memoria.clear();
  vindosDoAparelho.clear();
  aGravar = [];
  haDadosNovos = false;
  abertura = null;
  await apagarCopiaLocal();
}

let loteDisponivel: boolean | null = null;

const VALIDADE_SCRIPT_ANTIGO_MS = 30 * 60 * 1000;
const VALIDADE_FALHA_MS = 3 * 60 * 1000;
let loteAte = 0;

function scriptAceitaLote(): boolean | null {
  if (loteDisponivel === false && Date.now() > loteAte) loteDisponivel = null;
  if (loteDisponivel !== null) return loteDisponivel;
  try {
    const [estado, quando, validade] = String(sessionStorage.getItem(CHAVE_LOTE) || '').split('|');
    const ate = Number(quando) + (Number(validade) || VALIDADE_SCRIPT_ANTIGO_MS);
    if (estado === 'sim') loteDisponivel = true;
    else if (estado === 'nao' && Date.now() < ate) {
      loteDisponivel = false;
      loteAte = ate;
    }
  } catch {}
  return loteDisponivel;
}
function anotarLote(aceita: boolean, validadeMs: number = VALIDADE_FALHA_MS) {
  loteDisponivel = aceita;
  loteAte = Date.now() + validadeMs;
  try {
    sessionStorage.setItem(CHAVE_LOTE, `${aceita ? 'sim' : 'nao'}|${Date.now()}|${validadeMs}`);
  } catch {}
}

function sessaoCaiu() {
  sairDoAcesso();
  window.location.reload();
}

async function receberPacote(s: SessaoAcesso, itens: string[], visivel: boolean): Promise<Record<string, any> | null> {
  if (scriptAceitaLote() === false) return null;
  try {
    const resposta = await chamarScriptComAndamento({ acao: 'pacote', sessao: s.sessao, itens }, visivel, LIMITE_VARIOS_ARQUIVOS_MS);
    if (mapaDeArquivosValido(resposta)) {
      anotarLote(true);
      return resposta.arquivos;
    }
    if (resposta && resposta.codigo === 'sessao_invalida') sessaoCaiu();
    else anotarLote(false, resposta && resposta.codigo === 'acao_desconhecida' ? VALIDADE_SCRIPT_ANTIGO_MS : VALIDADE_FALHA_MS);
    return null;
  } catch (e) {
    console.warn('Falha ao receber o pacote de abertura; os arquivos serão pedidos um por um:', e);
    anotarLote(false);
    return null;
  }
}

let abertura: Promise<void> | null = null;

export function iniciarDadosDoAcesso(itensMarcados: string[]): Promise<void> {
  if (!abertura) {
    abertura = (async () => {
      const s = lerSessao();
      if (!s) return;
      donoAtual = donoDaSessao(s);
      const guardados = await lerCopiaLocal(donoAtual);
      if (guardados.some((a) => a.caminho === 'data/indice.json' && a.texto)) {
        guardados.forEach((a) => {
          memoria.set(a.caminho, a.texto);
          vindosDoAparelho.add(a.caminho);
        });
        return;
      }
      const arquivos = await receberPacote(s, itensMarcados, true);
      if (arquivos) Object.keys(arquivos).forEach((caminho) => lembrarResposta(caminho, arquivos[caminho]));
    })().catch((e) => console.warn('Falha ao preparar os dados do acesso:', e));
  }
  return abertura;
}

interface Pendente {
  caminho: string;
  silencioso: boolean;
  resolver: (valor: any) => void;
}

let filaDoLote: Pendente[] = [];
let temporizadorDoLote: ReturnType<typeof setTimeout> | null = null;

const MAXIMO_AVULSOS_JUNTOS = 3;
let avulsosEmCurso = 0;
const filaDeAvulsos: Array<() => void> = [];
async function esperarVezDeAvulso(): Promise<void> {
  if (avulsosEmCurso < MAXIMO_AVULSOS_JUNTOS) {
    avulsosEmCurso++;
    return;
  }
  await new Promise<void>((liberar) => filaDeAvulsos.push(liberar));
}
function liberarVezDeAvulso() {
  const proximo = filaDeAvulsos.shift();
  if (proximo) proximo();
  else avulsosEmCurso--;
}

const falhasDeLeitura = new Set<string>();
const semPublic = (caminho: string) => caminho.replace(/^\.?\//, '').replace(/^public\//, '');
export const marcarFalhaDeLeitura = (caminho: string) => { falhasDeLeitura.add(semPublic(caminho)); };
export const limparFalhaDeLeitura = (caminho: string) => { falhasDeLeitura.delete(semPublic(caminho)); };
async function buscarUmArquivo<T>(sessao: string, caminho: string, silencioso: boolean): Promise<T | null> {
  await esperarVezDeAvulso();
  try {
    const resposta = await chamarScriptComAndamento({ acao: 'arquivo', sessao, caminho }, !silencioso, LIMITE_UM_ARQUIVO_MS);
    if (respostaDeArquivoValida(resposta)) {
      lembrarResposta(caminho, resposta);
      limparFalhaDeLeitura(caminho);
      return (resposta.conteudo ?? null) as T | null;
    }
    marcarFalhaDeLeitura(caminho);
    if (resposta && resposta.codigo === 'sessao_invalida') sessaoCaiu();
    return null;
  } catch (e) {
    console.warn(`Falha ao buscar ${caminho} pelo serviço de acesso:`, e);
    marcarFalhaDeLeitura(caminho);
    return null;
  } finally {
    liberarVezDeAvulso();
  }
}

async function despacharLote(pendentes: Pendente[]) {
  const s = lerSessao();
  if (!s) {
    pendentes.forEach((p) => p.resolver(null));
    return;
  }
  const umPorUm = () => Promise.all(pendentes.map((p) => buscarUmArquivo(s.sessao, p.caminho, p.silencioso).then(p.resolver)));
  const caminhos = Array.from(new Set(pendentes.map((p) => p.caminho)));
  const visivel = pendentes.some((p) => !p.silencioso);
  try {
    const resposta = await chamarScriptComAndamento({ acao: 'arquivos', sessao: s.sessao, caminhos }, visivel, LIMITE_VARIOS_ARQUIVOS_MS);
    if (mapaDeArquivosValido(resposta)) {
      anotarLote(true);
      caminhos.forEach((caminho) => lembrarResposta(caminho, resposta.arquivos[caminho]));
      pendentes.forEach((p) => {
        const r = resposta.arquivos[p.caminho];
        if (respostaDeArquivoValida(r)) limparFalhaDeLeitura(p.caminho);
        else marcarFalhaDeLeitura(p.caminho);
        p.resolver(respostaDeArquivoValida(r) ? r.conteudo ?? null : null);
      });
      return;
    }
    if (resposta && resposta.codigo === 'sessao_invalida') {
      pendentes.forEach((p) => p.resolver(null));
      sessaoCaiu();
      return;
    }
    anotarLote(false, resposta && resposta.codigo === 'acao_desconhecida' ? VALIDADE_SCRIPT_ANTIGO_MS : VALIDADE_FALHA_MS);
    await umPorUm();
  } catch (e) {
    console.warn('Falha ao buscar vários arquivos de uma vez; tentando um por um:', e);
    anotarLote(false);
    await umPorUm();
  }
}

function esvaziarFilaDoLote() {
  temporizadorDoLote = null;
  const todos = filaDoLote;
  filaDoLote = [];
  for (let i = 0; i < todos.length; i += MAXIMO_POR_LOTE) {
    void despacharLote(todos.slice(i, i + MAXIMO_POR_LOTE));
  }
}

export async function buscarArquivoComSessao<T>(caminho: string, opcoes: OpcoesDeLeitura = {}): Promise<T | null> {
  const s = lerSessao();
  if (!s) return null;
  if (abertura) await abertura;
  if (memoria.has(caminho)) {
    const texto = memoria.get(caminho);
    if (texto === null || texto === undefined) {
      if (!vindosDoAparelho.has(caminho)) return null;
      memoria.delete(caminho);
      vindosDoAparelho.delete(caminho);
    } else {
      try {
        return JSON.parse(texto) as T;
      } catch {
        memoria.delete(caminho);
      }
    }
  }
  if (!donoAtual) donoAtual = donoDaSessao(s);
  const silencioso = Boolean(opcoes.silencioso);
  if (scriptAceitaLote() === false) return buscarUmArquivo<T>(s.sessao, caminho, silencioso);
  return new Promise<T | null>((resolver) => {
    filaDoLote.push({ caminho, silencioso, resolver });
    if (!temporizadorDoLote) temporizadorDoLote = setTimeout(esvaziarFilaDoLote, ESPERA_DO_LOTE_MS);
  });
}

const listaOuTodos = (v: unknown): string[] | 'TODOS' | undefined => (v === 'TODOS' ? 'TODOS' : Array.isArray(v) ? v.map(String) : undefined);
function permissoesDe(u: any): Pick<SessaoAcesso, 'ver' | 'inserir' | 'aprovacao'> {
  return { ver: listaOuTodos(u?.ver), inserir: listaOuTodos(u?.inserir), aprovacao: Boolean(u?.aprovacao) };
}
export async function atualizarPermissoes(): Promise<boolean> {
  const s = lerSessao();
  if (!s) return false;
  try {
    const r = await chamarScript({ acao: 'eu', sessao: s.sessao });
    if (!r || !r.ok || !r.usuario) return false;
    const u = r.usuario;
    const novo: SessaoAcesso = {
      ...s,
      nome: String(u.nome || s.nome),
      perfil: u.perfil === 'edicao' ? 'edicao' : 'consulta',
      candidatos: u.candidatos === 'TODOS' ? 'TODOS' : Array.isArray(u.candidatos) ? u.candidatos.map(String) : s.candidatos,
      ...permissoesDe(u)
    };
    const mudou = JSON.stringify(novo) !== JSON.stringify(s);
    if (mudou) localStorage.setItem(CHAVE_SESSAO, JSON.stringify(novo));
    return mudou;
  } catch {
    return false;
  }
}
