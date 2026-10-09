
import { CandidatoArquivoData, CandidatoInfo, CargoId, IndiceData, LoteEnvio } from '../types/election';
import { infoAPartirDoArquivo, normalizarIndice, recontarLotes, somarVotos } from './itens';

export interface ArquivoDeItemLido {
  caminho: string;
  tamanho: number;
  dados: Partial<CandidatoArquivoData> | null;
  erro?: string;
}

export interface Divergencia {
  id: string;
  nome: string;
  caminho: string;
  campo: string;
  noIndice: string;
  noArquivo: string;
}

export interface ArquivoSemEntrada {
  caminho: string;
  tamanho: number;
  nome: string;
  numero: string;
  ano: string;
  cargoDaPasta: string;
  cargoNoArquivo: string;
  totalVotos: number;
  totalSecoes: number;
  ilegivel: boolean;
  entradaSugerida: CandidatoInfo | null;
  parecidoCom?: string;
}

export interface RelatorioVerificacao {
  arquivosDeItens: number;
  itensConferidos: number;
  itensSemProblema: number;
  semEntrada: ArquivoSemEntrada[];
  semArquivo: CandidatoInfo[];
  divergencias: Divergencia[];
  auxiliares: Array<{ tipo: string; ano: string; problema: string }>;
  arquivosGrandes: Array<{ caminho: string; tamanho: number }>;
  outrosArquivos: string[];
}

const REGEX_ITEM = /^data\/(\d{4})\/([a-z_]+)\/[^/]+\.json$/;
const REGEX_AUXILIAR = /^data\/(\d{4})\/(locais|eleitorado|agregadas)\.json$/;
const COMUNS_NA_RAIZ = ['data/indice.json', 'data/locais.json', 'data/correspondencia_locais.json'];

export function relativoAoSite(caminhoNoRepositorio: string): string {
  return caminhoNoRepositorio.replace(/^public\//, '');
}

export function pertenceAMinas(caminhoRelativo: string): boolean {
  return caminhoRelativo.startsWith('data/mg/');
}

export function ehArquivoDeItem(caminhoRelativo: string): boolean {
  return !pertenceAMinas(caminhoRelativo) && REGEX_ITEM.test(caminhoRelativo) && !REGEX_AUXILIAR.test(caminhoRelativo);
}

const textoLotes = (lotes: LoteEnvio[] | undefined): string =>
  (lotes || []).map((l) => `${l.nomeArquivo} (${l.totalSecoes} seções, ${l.totalVotos} votos)`).join('; ') || 'nenhum';

export function analisarDados(
  indiceBruto: IndiceData | null,
  todosOsCaminhos: Array<{ caminho: string; tamanho: number }>,
  itensLidos: ArquivoDeItemLido[]
): RelatorioVerificacao {
  const indice = normalizarIndice(indiceBruto);
  const porCaminho = new Map<string, ArquivoDeItemLido>();
  itensLidos.forEach((a) => porCaminho.set(a.caminho, a));
  const caminhosExistentes = new Set(todosOsCaminhos.map((a) => a.caminho));
  const noIndice = new Map<string, CandidatoInfo>();
  indice.candidatos.forEach((c) => noIndice.set(String(c.arquivo || '').replace(/^\//, ''), c));

  const divergencias: Divergencia[] = [];
  const semArquivo: CandidatoInfo[] = [];
  let itensSemProblema = 0;

  indice.candidatos.forEach((cand) => {
    const caminho = String(cand.arquivo || '').replace(/^\//, '');
    const lido = porCaminho.get(caminho);
    if (!lido) {
      semArquivo.push(cand);
      return;
    }
    const antes = divergencias.length;
    const anotar = (campo: string, a: unknown, b: unknown) =>
      divergencias.push({ id: cand.id, nome: cand.nome, caminho, campo, noIndice: String(a ?? ''), noArquivo: String(b ?? '') });

    if (lido.erro || !lido.dados) {
      anotar('arquivo ilegível', 'entrada existe', lido.erro || 'conteúdo vazio');
      return;
    }
    const d = lido.dados;
    const secoes = d.secoes || [];
    const votosReais = somarVotos(secoes);
    if ((cand.totalVotos ?? 0) !== votosReais) anotar('total de votos', cand.totalVotos ?? 0, votosReais);
    if ((cand.totalSecoes ?? 0) !== secoes.length) anotar('total de seções', cand.totalSecoes ?? 0, secoes.length);

    const lotesReais = recontarLotes(d.lotes || [], secoes);
    if (textoLotes(cand.lotes) !== textoLotes(lotesReais)) anotar('lotes', textoLotes(cand.lotes), textoLotes(lotesReais));

    const partes = caminho.split('/');
    const cargoDaPasta = partes[2];
    if (d.cargo && d.cargo !== cargoDaPasta) anotar('cargo (pasta diferente do arquivo)', `pasta ${cargoDaPasta}`, String(d.cargo));
    if (cand.cargo !== cargoDaPasta) anotar('cargo (índice diferente da pasta)', cand.cargo, `pasta ${cargoDaPasta}`);
    if (d.ano && String(d.ano) !== partes[1]) anotar('ano (pasta diferente do arquivo)', `pasta ${partes[1]}`, String(d.ano));
    if (d.numero !== undefined && String(d.numero) !== String(cand.numero)) anotar('número', cand.numero, d.numero);
    if (d.candidatoId && d.candidatoId !== cand.id) anotar('identificador', cand.id, d.candidatoId);

    if (divergencias.length === antes) itensSemProblema++;
  });

  const semEntrada: ArquivoSemEntrada[] = [];
  const coresUsadas = indice.candidatos.map((c) => c.cor);
  itensLidos.forEach((a) => {
    if (noIndice.has(a.caminho)) return;
    const partes = a.caminho.split('/');
    const d = a.dados || {};
    const secoes = d.secoes || [];
    const sugerida =
      a.dados && !a.erro
        ? infoAPartirDoArquivo(a.caminho, { ...a.dados, cargo: partes[2] as CargoId, ano: partes[1], candidatoId: undefined }, undefined, coresUsadas)
        : null;
    const parecido = indice.candidatos.find(
      (c) => c.ano === partes[1] && String(c.numero) === String(d.numero ?? '') && String(d.numero ?? '') !== ''
    );
    semEntrada.push({
      caminho: a.caminho,
      tamanho: a.tamanho,
      nome: String(d.nome || partes[partes.length - 1]),
      numero: String(d.numero ?? ''),
      ano: partes[1],
      cargoDaPasta: partes[2],
      cargoNoArquivo: String(d.cargo || ''),
      totalVotos: somarVotos(secoes),
      totalSecoes: secoes.length,
      ilegivel: Boolean(a.erro) || !a.dados,
      entradaSugerida: sugerida,
      parecidoCom: parecido ? `${parecido.nome} (${parecido.numero}), ${parecido.cargo} ${parecido.ano}` : undefined
    });
  });

  const auxiliares: RelatorioVerificacao['auxiliares'] = [];
  const grupos: Array<[string, Record<string, string> | undefined, string]> = [
    ['locais', indice.locais, 'locais'],
    ['eleitorado', indice.eleitorados, 'eleitorado'],
    ['agregadas', indice.agregadas, 'agregadas']
  ];
  grupos.forEach(([tipo, mapa, arquivo]) => {
    Object.entries(mapa || {}).forEach(([ano, caminho]) => {
      if (!caminhosExistentes.has(String(caminho).replace(/^\//, ''))) {
        auxiliares.push({ tipo, ano, problema: `O índice aponta para ${caminho}, mas o arquivo não existe.` });
      }
    });
    todosOsCaminhos.forEach((a) => {
      const m = REGEX_AUXILIAR.exec(a.caminho);
      if (m && m[2] === arquivo && !(mapa || {})[m[1]]) {
        auxiliares.push({ tipo, ano: m[1], problema: `O arquivo ${a.caminho} existe, mas o índice não aponta para ele.` });
      }
    });
  });

  const outrosArquivos = todosOsCaminhos
    .map((a) => a.caminho)
    .filter((c) => !pertenceAMinas(c) && !ehArquivoDeItem(c) && !REGEX_AUXILIAR.test(c) && !COMUNS_NA_RAIZ.includes(c));

  return {
    arquivosDeItens: itensLidos.length,
    itensConferidos: indice.candidatos.length,
    itensSemProblema,
    semEntrada,
    semArquivo,
    divergencias,
    auxiliares,
    arquivosGrandes: todosOsCaminhos.filter((a) => !pertenceAMinas(a.caminho) && a.tamanho > 900 * 1024),
    outrosArquivos
  };
}

export function reconstruirIndice(
  indiceBruto: IndiceData | null,
  todosOsCaminhos: Array<{ caminho: string; tamanho: number }>,
  itensLidos: ArquivoDeItemLido[],
  incluirSemEntrada: string[]
): IndiceData {
  const indice = normalizarIndice(indiceBruto);
  const porCaminho = new Map<string, ArquivoDeItemLido>();
  itensLidos.forEach((a) => porCaminho.set(a.caminho, a));

  const candidatos: CandidatoInfo[] = [];
  const cores = indice.candidatos.map((c) => c.cor);

  indice.candidatos.forEach((cand) => {
    const caminho = String(cand.arquivo || '').replace(/^\//, '');
    const lido = porCaminho.get(caminho);
    if (!lido) return;
    if (lido.erro || !lido.dados) {
      candidatos.push(cand);
      return;
    }
    const partes = caminho.split('/');
    const info = infoAPartirDoArquivo(
      caminho,
      { ...lido.dados, cargo: partes[2] as CargoId, ano: partes[1], candidatoId: cand.id },
      cand,
      cores
    );
    candidatos.push({ ...info, nome: cand.nome || info.nome, numero: cand.numero || info.numero, tipo: cand.tipo || info.tipo });
  });

  incluirSemEntrada.forEach((caminho) => {
    const lido = porCaminho.get(caminho);
    if (!lido || lido.erro || !lido.dados) return;
    const partes = caminho.split('/');
    const info = infoAPartirDoArquivo(
      caminho,
      { ...lido.dados, cargo: partes[2] as CargoId, ano: partes[1], candidatoId: undefined },
      undefined,
      cores
    );
    if (candidatos.some((c) => c.id === info.id)) return;
    cores.push(info.cor);
    candidatos.push(info);
  });

  const existentes = new Set(todosOsCaminhos.map((a) => a.caminho));
  const locais: Record<string, string> = {};
  const eleitorados: Record<string, string> = {};
  const agregadas: Record<string, string> = {};
  todosOsCaminhos.forEach((a) => {
    const m = REGEX_AUXILIAR.exec(a.caminho);
    if (!m || !existentes.has(a.caminho)) return;
    if (m[2] === 'locais') locais[m[1]] = a.caminho;
    if (m[2] === 'eleitorado') eleitorados[m[1]] = a.caminho;
    if (m[2] === 'agregadas') agregadas[m[1]] = a.caminho;
  });

  return normalizarIndice({ ...indice, candidatos, locais, eleitorados, agregadas });
}

export function compararIndices(antes: IndiceData | null, depois: IndiceData): string[] {
  const a = normalizarIndice(antes);
  const mudancas: string[] = [];
  const mapaAntes = new Map(a.candidatos.map((c) => [c.id, c]));
  const mapaDepois = new Map(depois.candidatos.map((c) => [c.id, c]));

  depois.candidatos.forEach((d) => {
    const x = mapaAntes.get(d.id);
    const rotulo = `${d.nome} (${d.numero}), ${d.cargo} ${d.ano}`;
    if (!x) {
      mudancas.push(`Entra no índice: ${rotulo}, com ${d.totalVotos} votos em ${d.totalSecoes} seções.`);
      return;
    }
    if ((x.totalVotos ?? 0) !== (d.totalVotos ?? 0)) mudancas.push(`${rotulo}: total de votos de ${x.totalVotos ?? 0} para ${d.totalVotos ?? 0}.`);
    if ((x.totalSecoes ?? 0) !== (d.totalSecoes ?? 0)) mudancas.push(`${rotulo}: total de seções de ${x.totalSecoes ?? 0} para ${d.totalSecoes ?? 0}.`);
    if (textoLotes(x.lotes) !== textoLotes(d.lotes)) mudancas.push(`${rotulo}: lotes passam a ser ${textoLotes(d.lotes)}.`);
    if (x.cargo !== d.cargo) mudancas.push(`${rotulo}: cargo de ${x.cargo} para ${d.cargo}.`);
    if (x.arquivo !== d.arquivo) mudancas.push(`${rotulo}: arquivo de ${x.arquivo} para ${d.arquivo}.`);
  });
  a.candidatos.forEach((x) => {
    if (!mapaDepois.has(x.id)) mudancas.push(`Sai do índice (sem arquivo): ${x.nome} (${x.numero}), ${x.cargo} ${x.ano}.`);
  });

  const grupos: Array<[string, Record<string, string> | undefined, Record<string, string> | undefined]> = [
    ['locais', a.locais, depois.locais],
    ['eleitorado', a.eleitorados, depois.eleitorados],
    ['agregadas', a.agregadas, depois.agregadas]
  ];
  grupos.forEach(([nome, x, y]) => {
    const anos = new Set([...Object.keys(x || {}), ...Object.keys(y || {})]);
    anos.forEach((ano) => {
      const antesV = (x || {})[ano];
      const depoisV = (y || {})[ano];
      if (antesV && !depoisV) mudancas.push(`Sai do índice: arquivo de ${nome} de ${ano} (não existe mais).`);
      if (!antesV && depoisV) mudancas.push(`Entra no índice: arquivo de ${nome} de ${ano}.`);
    });
  });

  return mudancas;
}
