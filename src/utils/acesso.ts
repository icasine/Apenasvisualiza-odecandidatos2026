
import { URL_ACESSO } from '../config';
import { apagarCopiaLocal, guardarNaCopiaLocal, lerCopiaLocal, removerDaCopiaLocal } from './copiaLocal';

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
        setTimeout(() => void conferirCopiaDoAparelho(s, itensMarcados), 1500);
        return;
      }
      const arquivos = await receberPacote(s, itensMarcados, true);
      if (arquivos) Object.keys(arquivos).forEach((caminho) => lembrarResposta(caminho, arquivos[caminho]));
    })().catch((e) => console.warn('Falha ao preparar os dados do acesso:', e));
  }
  return abertura;
}

async function conferirCopiaDoAparelho(s: SessaoAcesso, itensMarcados: string[]) {
  const novos = new Map<string, string | null>();
  const negados: string[] = [];
  const aplicar = (arquivos: Record<string, any> | null | undefined) => {
    if (!arquivos) return;
    Object.keys(arquivos).forEach((caminho) => {
      const r = arquivos[caminho];
      if (respostaDeArquivoValida(r)) novos.set(caminho, r.existe === false || r.conteudo == null ? null : JSON.stringify(r.conteudo));
      else if (r && r.ok === false && (r.codigo === 'sem_permissao' || r.codigo === 'caminho_invalido')) negados.push(caminho);
    });
  };
  try {
    aplicar(await receberPacote(s, itensMarcados, false));
    const faltam = Array.from(vindosDoAparelho).filter((c) => !novos.has(c) && !negados.includes(c));
    if (scriptAceitaLote() !== false) {
      for (let i = 0; i < faltam.length; i += MAXIMO_POR_LOTE) {
        const resposta = await chamarScriptComAndamento({ acao: 'arquivos', sessao: s.sessao, caminhos: faltam.slice(i, i + MAXIMO_POR_LOTE) }, false, LIMITE_VARIOS_ARQUIVOS_MS);
        if (resposta && resposta.codigo === 'sessao_invalida') return sessaoCaiu();
        if (mapaDeArquivosValido(resposta)) aplicar(resposta.arquivos);
      }
    } else {
      for (const caminho of faltam) {
        const resposta = await chamarScript({ acao: 'arquivo', sessao: s.sessao, caminho });
        if (resposta && resposta.codigo === 'sessao_invalida') return sessaoCaiu();
        aplicar({ [caminho]: resposta });
      }
    }
  } catch (e) {
    console.warn('Não foi possível conferir se há dados mais novos:', e);
  }

  let mudou = false;
  const gravar: Array<{ caminho: string; texto: string | null }> = [];
  novos.forEach((texto, caminho) => {
    if (vindosDoAparelho.has(caminho)) {
      if (memoria.get(caminho) !== texto) {
        mudou = true;
        gravar.push({ caminho, texto });
      }
    } else if (!memoria.has(caminho)) {
      memoria.set(caminho, texto);
      gravar.push({ caminho, texto });
    }
  });
  const perdidos = negados.filter((c) => vindosDoAparelho.has(c));
  if (perdidos.length > 0) {
    mudou = true;
    void removerDaCopiaLocal(perdidos);
  }
  if (gravar.length > 0) void guardarNaCopiaLocal(donoAtual, gravar);
  if (mudou) {
    haDadosNovos = true;
    avisarOuvintes();
  }
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

async function buscarUmArquivo<T>(sessao: string, caminho: string, silencioso: boolean): Promise<T | null> {
  await esperarVezDeAvulso();
  try {
    const resposta = await chamarScriptComAndamento({ acao: 'arquivo', sessao, caminho }, !silencioso, LIMITE_UM_ARQUIVO_MS);
    if (respostaDeArquivoValida(resposta)) {
      lembrarResposta(caminho, resposta);
      return (resposta.conteudo ?? null) as T | null;
    }
    if (resposta && resposta.codigo === 'sessao_invalida') sessaoCaiu();
    return null;
  } catch (e) {
    console.warn(`Falha ao buscar ${caminho} pelo serviço de acesso:`, e);
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
export function podeVerArea(area: string): boolean {
  if (!acessoAtivo()) return true;
  const s = lerSessao();
  if (!s) return false;
  if (s.perfil === 'edicao') return true;
  const ver = s.ver === undefined ? (s.candidatos === 'TODOS' ? 'TODOS' : []) : s.ver;
  return ver === 'TODOS' || ver.includes(area);
}
export function podeInserirArea(area: string): boolean {
  if (!acessoAtivo()) return true;
  const s = lerSessao();
  if (!s) return false;
  if (s.perfil === 'edicao') return true;
  return s.inserir === 'TODOS' || (s.inserir || []).includes(area);
}
export function insercaoComAprovacao(): boolean {
  const s = lerSessao();
  return Boolean(s && s.perfil !== 'edicao' && s.aprovacao);
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
export async function gravarPeloAcesso(caminho: string, item: Record<string, unknown>, remover = false): Promise<{ pendente: boolean }> {
  const s = lerSessao();
  if (!s) throw new Error('Entre no mapa de novo para gravar.');
  const r = await chamarScript({ acao: 'gravar', sessao: s.sessao, caminho: caminho.replace(/^public\//, ''), item, remover });
  if (!r || !r.ok) throw new Error(r?.erro || 'Não foi possível gravar.');
  return { pendente: Boolean(r.pendente) };
}
export interface Pendencia { id: string; data: string; usuario: string; arquivo: string; acao: string; resumo: string; item: any }
export async function listarPendencias(): Promise<Pendencia[]> {
  const s = lerSessao();
  if (!s) return [];
  const r = await chamarScript({ acao: 'pendencias', sessao: s.sessao });
  if (!r || !r.ok) throw new Error(r?.erro || 'Não foi possível ler as aprovações.');
  return Array.isArray(r.pendencias) ? r.pendencias : [];
}
export async function decidirPendencia(id: string, aprovar: boolean): Promise<void> {
  const s = lerSessao();
  if (!s) throw new Error('Entre no mapa de novo.');
  const r = await chamarScript({ acao: 'decidir', sessao: s.sessao, id, aprovar });
  if (!r || !r.ok) throw new Error(r?.erro || 'Não foi possível concluir.');
}
