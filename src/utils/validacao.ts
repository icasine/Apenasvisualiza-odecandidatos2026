
import { CorrespondenciaLocaisArquivo, IndiceData, LocalVotacao, SecaoVotoCandidato } from '../types/election';
import { comPartidoDoNumero, limparNomeDeItem } from './itens';

const LAT_MIN = -20.25;
const LAT_MAX = -19.6;
const LON_MIN = -44.45;
const LON_MAX = -43.75;

const texto = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());

export interface ResultadoValidacao<T> {
  dados: T;
  ignoradas: number;
  avisos: string[];
}

export function validarVotos(bruto: unknown): ResultadoValidacao<SecaoVotoCandidato[]> | null {
  const linhas: unknown = Array.isArray(bruto) ? bruto : bruto && typeof bruto === 'object' ? (bruto as any).secoes : null;
  if (!Array.isArray(linhas)) return null;
  const dados: SecaoVotoCandidato[] = [];
  let ignoradas = 0;
  linhas.forEach((l: any) => {
    const zona = texto(l?.zona);
    const secao = texto(l?.secao);
    const votos = Number(l?.votos);
    if (!zona || !secao || !Number.isInteger(votos) || votos < 0) {
      ignoradas++;
      return;
    }
    const linha: SecaoVotoCandidato = { zona, secao, votos };
    const local = texto(l.local_votacao_num);
    if (local) linha.local_votacao_num = local;
    const aptos = Number(l.aptos);
    if (Number.isFinite(aptos) && aptos > 0) linha.aptos = aptos;
    if (l.loteId) linha.loteId = texto(l.loteId);
    dados.push(linha);
  });
  const avisos = ignoradas > 0 ? [`${ignoradas} linha(s) de votos com dados inválidos foram ignoradas.`] : [];
  return { dados, ignoradas, avisos };
}

export function validarLocais(bruto: unknown): ResultadoValidacao<LocalVotacao[]> | null {
  if (!Array.isArray(bruto)) return null;
  const dados: LocalVotacao[] = [];
  let ignoradas = 0;
  let coordenadasFora = 0;
  bruto.forEach((l: any) => {
    const zona = texto(l?.zona);
    const secao = texto(l?.secao);
    if (!zona || !secao) {
      ignoradas++;
      return;
    }
    let latitude = l.latitude === null || l.latitude === undefined || l.latitude === '' ? null : Number(l.latitude);
    let longitude = l.longitude === null || l.longitude === undefined || l.longitude === '' ? null : Number(l.longitude);
    if (latitude !== null && longitude !== null) {
      const dentro =
        Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= LAT_MIN && latitude <= LAT_MAX && longitude >= LON_MIN && longitude <= LON_MAX;
      if (!dentro) {
        coordenadasFora++;
        latitude = null;
        longitude = null;
      }
    } else {
      latitude = null;
      longitude = null;
    }
    const aptos = Number(l.aptos);
    dados.push({
      zona,
      secao,
      local_votacao_num: texto(l.local_votacao_num) || '0',
      nome_local: texto(l.nome_local) || 'Local sem nome',
      endereco: texto(l.endereco),
      bairro: texto(l.bairro) || 'Não informado',
      cep: texto(l.cep) || undefined,
      latitude,
      longitude,
      aptos: Number.isFinite(aptos) && aptos > 0 ? aptos : 0,
      tipoSecao: l.tipoSecao === 'Agregada' ? 'Agregada' : 'Principal',
      secaoPrincipal: l.secaoPrincipal ? texto(l.secaoPrincipal) : undefined
    });
  });
  const avisos: string[] = [];
  if (ignoradas > 0) avisos.push(`${ignoradas} linha(s) do cadastro de locais sem zona ou seção foram ignoradas.`);
  if (coordenadasFora > 0) avisos.push(`${coordenadasFora} seção(ões) com coordenada fora da região de Contagem ficaram sem ponto no mapa.`);
  return { dados, ignoradas, avisos };
}

export function validarEleitorado(bruto: unknown): Record<string, number> | null {
  if (!Array.isArray(bruto)) return null;
  const mapa: Record<string, number> = {};
  bruto.forEach((r: any) => {
    const zona = texto(r?.zona);
    const secao = texto(r?.secao);
    const aptos = Number(r?.aptos);
    if (zona && secao && Number.isFinite(aptos) && aptos >= 0) mapa[`${zona}_${secao}`] = aptos;
  });
  return mapa;
}

export function validarAgregadas(bruto: unknown): Record<string, string> | null {
  if (!Array.isArray(bruto)) return null;
  const mapa: Record<string, string> = {};
  bruto.forEach((r: any) => {
    const zona = texto(r?.zona);
    const secao = texto(r?.secao);
    const destino = texto(r?.secao_destino);
    if (!zona || !secao || !destino) return;
    const situacao = texto(r?.situacao).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (situacao.includes('agreg') && !/\b(nao|sem|principal|normal)\b/.test(situacao)) {
      mapa[`${zona}_${secao}`] = `${texto(r?.zona_destino) || zona}_${destino}`;
    }
  });
  return mapa;
}

export function resolverCadeiaDeSecoes(mapa: Record<string, string>): Record<string, string> {
  const saida: Record<string, string> = {};
  Object.keys(mapa).forEach((origem) => {
    let atual = mapa[origem];
    const vistos = new Set<string>([origem]);
    while (mapa[atual] && !vistos.has(atual) && vistos.size < 50) {
      vistos.add(atual);
      atual = mapa[atual];
    }
    saida[origem] = atual;
  });
  return saida;
}

export function validarSecoesExtintas(bruto: unknown): Record<string, string> | null {
  if (!Array.isArray(bruto)) return null;
  const mapa: Record<string, string> = {};
  bruto.forEach((r: any) => {
    const zona = texto(r?.zona);
    const secao = texto(r?.secao);
    const destino = texto(r?.secao_destino);
    if (!zona || !secao || !destino) return;
    const situacao = texto(r?.situacao).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (situacao.includes('desativ') || situacao.includes('extint')) mapa[`${zona}_${secao}`] = `${texto(r?.zona_destino) || zona}_${destino}`;
  });
  return mapa;
}

export function validarIndice(bruto: unknown): IndiceData | null {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null;
  const b = bruto as any;
  const candidatos = (Array.isArray(b.candidatos) ? b.candidatos : []).filter(
    (c: any) => c && typeof c.id === 'string' && typeof c.arquivo === 'string' && /^data\/[A-Za-z0-9_\-/.]+\.json$/.test(c.arquivo) && !c.arquivo.includes('..')
  );
  const mapa = (m: unknown): Record<string, string> => {
    const saida: Record<string, string> = {};
    if (m && typeof m === 'object') {
      Object.entries(m as Record<string, unknown>).forEach(([ano, caminho]) => {
        if (/^\d{4}$/.test(ano) && typeof caminho === 'string' && /^data\/[A-Za-z0-9_\-/.]+\.json$/.test(caminho) && !caminho.includes('..')) {
          saida[ano] = caminho;
        }
      });
    }
    return saida;
  };
  return {
    municipio: texto(b.municipio) || 'Contagem',
    uf: texto(b.uf) || 'MG',
    atualizacao: b.atualizacao ? texto(b.atualizacao) : null,
    anos: Array.isArray(b.anos) ? b.anos.map((a: unknown) => texto(a)).filter((a: string) => /^\d{4}$/.test(a)) : [],
    zonas: Array.isArray(b.zonas) ? b.zonas.map((z: unknown) => texto(z)) : undefined,
    candidatos: candidatos.map((c: any) => comPartidoDoNumero({ ...c, ano: texto(c.ano), numero: texto(c.numero), nome: limparNomeDeItem(texto(c.nome)) || 'Sem nome' })),
    locais: mapa(b.locais),
    eleitorados: mapa(b.eleitorados),
    agregadas: mapa(b.agregadas)
  };
}

export function validarCorrespondencia(bruto: unknown): CorrespondenciaLocaisArquivo | null {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null;
  const b = bruto as any;
  if (!/^\d{4}$/.test(texto(b.referencia))) return null;
  const anos: Record<string, Record<string, string>> = {};
  if (b.anos && typeof b.anos === 'object') {
    Object.entries(b.anos as Record<string, unknown>).forEach(([ano, pares]) => {
      if (!/^\d{4}$/.test(ano) || !pares || typeof pares !== 'object') return;
      anos[ano] = {};
      Object.entries(pares as Record<string, unknown>).forEach(([de, para]) => {
        if (typeof para === 'string') anos[ano][de] = para;
      });
    });
  }
  return { referencia: texto(b.referencia), atualizacao: b.atualizacao ? texto(b.atualizacao) : null, anos };
}
