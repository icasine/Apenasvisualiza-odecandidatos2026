
import * as XLSX from 'xlsx';
import {
  CargoId,
  LocalVotacao,
  PreviaArquivoCandidato,
  PreviaArquivoLocais,
  PreviaItemLote,
  PreviaMultiplosItens,
  LinhaPreviaItem,
  DuplicadoSecaoDetalhe,
  TipoItemEleitoral,
  LoteEnvio,
  CandidatoInfo,
  SecaoEleitorado,
  SecaoCorrespondencia,
  SecaoVotoCandidato,
  ConflitoSecaoLote
} from '../types/election';
import { montarIdItem, montarCaminhoItem, numeroDoPartido, partidoPeloNumero, siglaConhecida } from './itens';

export function limparTexto(str: string): string {
  return String(str || '').replace(/^\uFEFF/, '').trim();
}

export function normalizarChave(str: string): string {
  return limparTexto(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export function normalizarZona(zonaRaw: string | number): string {
  const str = String(zonaRaw || '').trim();
  const digits = str.replace(/\D/g, '');
  if (!digits) return str;
  const num = parseInt(digits, 10);
  return isNaN(num) ? digits : String(num);
}

export function normalizarSecao(secaoRaw: string | number): string {
  const str = String(secaoRaw || '').trim();
  if (str === '-1') return '-1';
  const digits = str.replace(/\D/g, '');
  return digits ? digits.padStart(4, '0') : str;
}

export async function extrairLinhasDeArquivo(file: File): Promise<string[][]> {
  const nomeLower = file.name.toLowerCase();

  if (nomeLower.endsWith('.xlsx') || nomeLower.endsWith('.xls')) {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    
    const sheetName =
      workbook.SheetNames.find((s) => s.toLowerCase().replace(/\s/g, '') === 'planilha1') ||
      workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    return rawData.map((row) =>
      row.map((cell) => String(cell !== null && cell !== undefined ? cell : '').trim())
    );
  }

  const text = decodificarTexto(await file.arrayBuffer());
  const clean = text.replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length === 0) return [];

  const firstLine = lines[0];
  const countSemi = (firstLine.match(/;/g) || []).length;
  const countComma = (firstLine.match(/,/g) || []).length;
  const delimiter = countSemi >= countComma ? ';' : ',';

  return lines.map((line) => {
    const row: string[] = [];
    let insideQuotes = false;
    let current = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === delimiter && !insideQuotes) {
        row.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    row.push(current.trim());
    return row;
  });
}

export function textoIndicaAgregada(valor: unknown): boolean {
  const t = normalizarChave(String(valor ?? ''));
  if (!t.includes('agreg')) return false;
  return !/(^|_)(nao|sem|principal|normal)(_|$)/.test(t);
}

export function decodificarTexto(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

export function lerNumeroDeVotos(valor: unknown): { votos: number | null; invalido: boolean } {
  const s = String(valor ?? '').trim();
  if (!s || s === '-') return { votos: null, invalido: false };
  if (/^\d+$/.test(s)) return { votos: parseInt(s, 10), invalido: false };
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return { votos: parseInt(s.replace(/\./g, ''), 10), invalido: false };
  if (/^\d+[.,]0+$/.test(s)) return { votos: parseInt(s, 10), invalido: false };
  return { votos: null, invalido: true };
}

export const ALIASES_CANDIDATO: Record<string, string[]> = {
  zona: ['nr_zona', 'num_zona', 'cd_zona', 'zona', 'nr_zona_eleitoral', 'numero_zona'],
  secao: ['nr_secao', 'num_secao', 'cd_secao', 'secao', 'secao_eleitoral', 'nr_secao_eleitoral', 'numero_secao'],
  local_votacao_num: [
    'nr_local_votacao',
    'nr_local',
    'local_votacao_num',
    'local_votacao',
    'local',
    'local_num',
    'num_local',
    'numero_local',
    'local_de_votacao'
  ],
  votos: [
    'votos',
    'voto',
    'qt_votos',
    'total_votos',
    'votos_nominais',
    'votos_candidato',
    'qt_votos_nominais',
    'quantidade_votos',
    'votacao'
  ],
  aptos: [
    'qt_eleitor_secao',
    'qt_aptos',
    'aptos',
    'eleitores_aptos',
    'eleitores',
    'total_aptos',
    'total_eleitores'
  ]
};

export const ALIASES_LOCAIS: Record<string, string[]> = {
  zona: ['nr_zona', 'num_zona', 'cd_zona', 'zona'],
  secao: ['nr_secao', 'num_secao', 'cd_secao', 'secao'],
  local_votacao_num: ['nr_local_votacao', 'nr_local', 'num_local', 'local_votacao_num', 'local_votacao', 'local', 'numero_local'],
  nome_local: ['nm_local_votacao', 'nome_local', 'nome_escola', 'escola', 'local_nome', 'nm_loc_vot'],
  endereco: ['ds_endereco', 'endereco', 'logradouro', 'rua', 'nm_endereco'],
  bairro: ['nm_bairro', 'bairro', 'bairro_local'],
  cep: ['nr_cep', 'cep'],
  latitude: ['nr_latitude', 'latitude', 'lat', 'coord_lat'],
  longitude: ['nr_longitude', 'longitude', 'lon', 'lng', 'long', 'coord_lon'],
  ano: ['aa_eleicao', 'ano_eleicao', 'ano'],
  aptos: ['qt_eleitor_secao', 'qt_aptos', 'eleitores_aptos', 'aptos', 'eleitores'],
  tipo_agregada: ['ds_tipo_secao_agregada', 'tipo_secao_agregada', 'secao_agregada', 'tp_secao_agregada'],
  secao_principal: ['nr_secao_principal', 'secao_principal', 'nr_secao_destino', 'secao_destino']
};

export function identificarColunas(
  headers: string[],
  aliases: Record<string, string[]>
): Record<string, string> {
  const mapeamento: Record<string, string> = {};
  const usadas = new Set<string>();

  for (const [campo, listaAliases] of Object.entries(aliases)) {
    const achado = headers.find((h) => {
      if (usadas.has(h)) return false;
      const norm = normalizarChave(h);
      return norm === campo || listaAliases.some((alias) => norm === alias);
    });
    if (achado) {
      mapeamento[campo] = achado;
      usadas.add(achado);
    }
  }

  for (const [campo, listaAliases] of Object.entries(aliases)) {
    if (mapeamento[campo]) continue;
    const achado = headers.find((h) => {
      if (usadas.has(h)) return false;
      const norm = normalizarChave(h);
      return norm.length > 0 && listaAliases.some((alias) => norm.includes(alias));
    });
    if (achado) {
      mapeamento[campo] = achado;
      usadas.add(achado);
    }
  }

  return mapeamento;
}

export function gerarSlugCandidato(numero: string, nome: string): string {
  const cleanNumero = numero.trim().replace(/\D/g, '');
  const cleanNome = normalizarChave(nome).replace(/_/g, '-');
  return `${cleanNumero}-${cleanNome}`;
}

export function processarPreviaLocais(
  rawRows: string[][],
  mapeamentoCustomizado?: Record<string, string>,
  anoOverride?: string
): PreviaArquivoLocais {
  if (rawRows.length < 2) {
    throw new Error('O arquivo de locais não possui dados suficientes (mínimo de 1 linha de cabeçalho e 1 de dados).');
  }

  const headers = rawRows[0];
  const mapeamento = mapeamentoCustomizado || identificarColunas(headers, ALIASES_LOCAIS);

  const idxZona = headers.indexOf(mapeamento['zona'] || '');
  const idxSecao = headers.indexOf(mapeamento['secao'] || '');
  const idxLocal = headers.indexOf(mapeamento['local_votacao_num'] || '');
  const idxNome = headers.indexOf(mapeamento['nome_local'] || '');
  const idxEndereco = headers.indexOf(mapeamento['endereco'] || '');
  const idxBairro = headers.indexOf(mapeamento['bairro'] || '');
  const idxCep = headers.indexOf(mapeamento['cep'] || '');
  const idxLat = headers.indexOf(mapeamento['latitude'] || '');
  const idxLon = headers.indexOf(mapeamento['longitude'] || '');
  const idxAno = headers.indexOf(mapeamento['ano'] || '');
  const idxAptos = headers.indexOf(mapeamento['aptos'] || '');
  const idxTipoAgregada = headers.indexOf(mapeamento['tipo_agregada'] || '');
  const idxSecaoPrincipal = headers.indexOf(mapeamento['secao_principal'] || '');

  const colunasReconhecidas: Record<string, string> = {};
  Object.entries(mapeamento).forEach(([campo, colOriginal]) => {
    if (colOriginal) colunasReconhecidas[campo] = colOriginal;
  });

  const valoresMapeados = new Set(Object.values(colunasReconhecidas));
  const colunasIgnoradas = headers.filter((h) => !valoresMapeados.has(h));

  const avisos: PreviaArquivoLocais['avisos'] = [];
  const secoesVistas = new Set<string>();
  const locaisVistos = new Set<string>();
  const zonasVistas = new Set<string>();
  const bairrosVistos = new Set<string>();
  const locaisPorZona = new Map<string, Set<string>>();

  const linhasValidas: LocalVotacao[] = [];
  const agregadasList: SecaoCorrespondencia[] = [];
  const eleitoradoList: SecaoEleitorado[] = [];

  const totaisPorZona: Record<
    string,
    { secoes: number; locais: number; eleitores: number; agregadas: number; eleitoresAgregadas: number }
  > = {};

  let anoDetectado = anoOverride || '';
  let totalEleitores = 0;
  let totalAgregadas = 0;
  let totalEleitoresAgregadas = 0;

  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (row.length === 0 || row.every((c) => !c)) continue;

    const zonaRaw = idxZona >= 0 ? row[idxZona] : '';
    const secaoRaw = idxSecao >= 0 ? row[idxSecao] : '';
    const localRaw = idxLocal >= 0 ? row[idxLocal] : '';
    const nomeRaw = idxNome >= 0 ? row[idxNome] : '';
    const endRaw = idxEndereco >= 0 ? row[idxEndereco] : '';
    const bairroRaw = idxBairro >= 0 ? row[idxBairro] : '';
    const cepRaw = idxCep >= 0 ? row[idxCep] : '';
    const latRaw = idxLat >= 0 ? row[idxLat] : '';
    const lonRaw = idxLon >= 0 ? row[idxLon] : '';
    const anoRaw = idxAno >= 0 ? row[idxAno] : '';
    const aptosRaw = idxAptos >= 0 ? row[idxAptos] : '';
    const tipoAgregadaRaw = idxTipoAgregada >= 0 ? row[idxTipoAgregada] : '';
    const secaoPrincipalRaw = idxSecaoPrincipal >= 0 ? row[idxSecaoPrincipal] : '';

    if (!anoDetectado && anoRaw) {
      anoDetectado = anoRaw.replace(/\D/g, '').trim();
    }

    const zona = normalizarZona(zonaRaw);
    const secao = normalizarSecao(secaoRaw);
    const local_votacao_num = localRaw.replace(/\D/g, '') || '0';
    const nome_local = nomeRaw.trim() || `Local nº ${local_votacao_num}`;
    const endereco = endRaw.trim() || 'Não informado';
    const bairro = bairroRaw.trim() || 'Não informado';
    const cep = cepRaw.trim();

    if (!zona || !secao) {
      avisos.push({
        tipo: 'ignorado',
        texto: `Linha ${i + 1} ignorada: zona ou seção ausente.`
      });
      continue;
    }

    let lat: number | null = null;
    let lon: number | null = null;

    if (latRaw.trim()) {
      const cleanLat = latRaw.replace(/\s/g, '').replace(',', '.');
      const numLat = parseFloat(cleanLat);
      if (!isNaN(numLat) && numLat >= -90 && numLat <= 90) {
        lat = numLat;
      } else {
        avisos.push({
          tipo: 'coordenada_invalida',
          texto: `Linha ${i + 1} (Seção ${secao}): latitude '${latRaw}' inválida.`
        });
      }
    }

    if (lonRaw.trim()) {
      const cleanLon = lonRaw.replace(/\s/g, '').replace(',', '.');
      const numLon = parseFloat(cleanLon);
      if (!isNaN(numLon) && numLon >= -180 && numLon <= 180) {
        lon = numLon;
      } else {
        avisos.push({
          tipo: 'coordenada_invalida',
          texto: `Linha ${i + 1} (Seção ${secao}): longitude '${lonRaw}' inválida.`
        });
      }
    }

    if (lat === null || lon === null) {
      avisos.push({
        tipo: 'sem_coordenada',
        texto: `Seção ${secao} (Zona ${zona}, Local ${local_votacao_num}) sem coordenada cadastrada.`
      });
    }

    const aptosNum = parseInt(aptosRaw.replace(/\D/g, ''), 10) || 0;
    totalEleitores += aptosNum;

    const cleanSecPrincipal = normalizarSecao(secaoPrincipalRaw);
    const isAgregada =
      textoIndicaAgregada(tipoAgregadaRaw) ||
      (cleanSecPrincipal && cleanSecPrincipal !== '-1' && cleanSecPrincipal !== '0000' && cleanSecPrincipal !== secao);

    if (isAgregada) {
      totalAgregadas++;
      totalEleitoresAgregadas += aptosNum;
      const destino = cleanSecPrincipal && cleanSecPrincipal !== '-1' ? cleanSecPrincipal : secao;
      agregadasList.push({
        zona,
        secao,
        zona_destino: zona,
        secao_destino: destino,
        situacao: 'Agregada'
      });
    }

    eleitoradoList.push({
      zona,
      secao,
      aptos: aptosNum
    });

    const chaveSecao = `${zona}_${secao}`;
    if (secoesVistas.has(chaveSecao)) {
      avisos.push({
        tipo: 'duplicada',
        texto: `Seção ${secao} (Zona ${zona}) aparece mais de uma vez no arquivo de locais.`
      });
    }
    secoesVistas.add(chaveSecao);

    const chaveLocal = `${zona}_${local_votacao_num}`;
    locaisVistos.add(chaveLocal);
    zonasVistas.add(zona);
    if (bairro && bairro !== 'Não informado') bairrosVistos.add(bairro);

    if (!locaisPorZona.has(zona)) {
      locaisPorZona.set(zona, new Set());
    }
    locaisPorZona.get(zona)!.add(local_votacao_num);

    if (!totaisPorZona[zona]) {
      totaisPorZona[zona] = { secoes: 0, locais: 0, eleitores: 0, agregadas: 0, eleitoresAgregadas: 0 };
    }
    totaisPorZona[zona].secoes += 1;
    totaisPorZona[zona].eleitores += aptosNum;
    if (isAgregada) {
      totaisPorZona[zona].agregadas += 1;
      totaisPorZona[zona].eleitoresAgregadas += aptosNum;
    }

    linhasValidas.push({
      zona,
      secao,
      local_votacao_num,
      nome_local,
      endereco,
      bairro,
      cep,
      latitude: lat,
      longitude: lon,
      aptos: aptosNum,
      tipoSecao: isAgregada ? 'Agregada' : 'Principal',
      secaoPrincipal: isAgregada ? cleanSecPrincipal : undefined
    });
  }

  Object.keys(totaisPorZona).forEach((z) => {
    totaisPorZona[z].locais = locaisPorZona.get(z)?.size || 0;
  });

  const anoFinal = anoDetectado || '2024';

  return {
    ano: anoFinal,
    caminhoRelativo: 'data/locais.json',
    caminhoAno: `data/${anoFinal}/locais.json`,
    totalLinhas: rawRows.length - 1,
    totalSecoes: secoesVistas.size,
    totalLocais: locaisVistos.size,
    totalAgregadas,
    totalEleitores,
    totalEleitoresAgregadas,
    zonasEncontradas: Array.from(zonasVistas).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b)),
    totaisPorZona,
    bairrosEncontrados: Array.from(bairrosVistos).sort(),
    linhas: linhasValidas,
    agregadas: agregadasList,
    eleitorado: eleitoradoList,
    colunasOriginais: headers,
    colunasReconhecidas,
    colunasIgnoradas,
    mapeamentoColunas: mapeamento,
    avisos
  };
}

export function processarPreviaCandidato(
  rawRows: string[][],
  nomeCandidato: string,
  numeroCandidato: string,
  cargo: CargoId,
  ano: string,
  locaisReferencia: LocalVotacao[],
  mapeamentoCustomizado?: Record<string, string>,
  dadosExistentesCandidato?: SecaoVotoCandidato[],
  nomeArquivo?: string
): PreviaArquivoCandidato {
  if (rawRows.length < 2) {
    throw new Error('O arquivo não possui dados suficientes (mínimo de 1 linha de cabeçalho e 1 de dados).');
  }

  const headers = rawRows[0];
  const mapeamento = mapeamentoCustomizado || identificarColunas(headers, ALIASES_CANDIDATO);

  const idxZona = headers.indexOf(mapeamento['zona'] || '');
  const idxSecao = headers.indexOf(mapeamento['secao'] || '');
  const idxLocal = headers.indexOf(mapeamento['local_votacao_num'] || '');
  const idxVotos = headers.indexOf(mapeamento['votos'] || '');
  const idxAptos = headers.indexOf(mapeamento['aptos'] || '');

  const colunasReconhecidas = new Set(Object.values(mapeamento).filter(Boolean));
  const colunasIgnoradas = headers.filter((h) => !colunasReconhecidas.has(h));

  const avisos: PreviaArquivoCandidato['avisos'] = [];
  const secoesVistas = new Set<string>();
  const locaisVistos = new Set<string>();
  const totaisPorZona: Record<string, { votos: number; eleitores: number; secoes: number }> = {};
  const linhasValidas: PreviaArquivoCandidato['linhas'] = [];

  const mapaExistentes = new Map<string, SecaoVotoCandidato>();
  if (dadosExistentesCandidato) {
    dadosExistentesCandidato.forEach((s) => {
      mapaExistentes.set(`${s.zona}_${s.secao}`, s);
    });
  }

  const conflitos: ConflitoSecaoLote[] = [];
  let secoesNovasCount = 0;
  let secoesExistentesCount = 0;

  let totalVotos = 0;
  let totalEleitores = 0;

  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (row.length === 0 || row.every((c) => !c)) continue;

    const zonaRaw = idxZona >= 0 ? row[idxZona] : '';
    const secaoRaw = idxSecao >= 0 ? row[idxSecao] : '';
    const localRaw = idxLocal >= 0 ? row[idxLocal] : '';
    const votosRaw = idxVotos >= 0 ? row[idxVotos] : '';
    const aptosRaw = idxAptos >= 0 ? row[idxAptos] : '';

    const zona = normalizarZona(zonaRaw);
    const secao = normalizarSecao(secaoRaw);
    const local_votacao_num = localRaw.replace(/\D/g, '') || '0';

    if (!zona || !secao) {
      avisos.push({
        tipo: 'ignorado',
        texto: `Linha ${i + 1} ignorada: zona ou seção ausente.`,
        detalhes: JSON.stringify(row)
      });
      continue;
    }

    const chaveSecao = `${zona}_${secao}`;
    if (secoesVistas.has(chaveSecao)) {
      avisos.push({
        tipo: 'duplicada',
        texto: `Seção ${secao} (Zona ${zona}) aparece mais de uma vez no arquivo. A última ocorrência será considerada.`
      });
    }
    secoesVistas.add(chaveSecao);
    locaisVistos.add(`${zona}_${local_votacao_num}`);

    const cleanVotos = votosRaw.replace(/\./g, '').replace(/,/g, '');
    const votosNum = parseInt(cleanVotos, 10);
    const cleanAptos = aptosRaw.replace(/\./g, '').replace(/,/g, '');
    const aptosNum = cleanAptos ? parseInt(cleanAptos, 10) : 0;

    if (isNaN(votosNum)) {
      avisos.push({
        tipo: 'valor_invalido',
        texto: `Linha ${i + 1}: valor de votos '${votosRaw}' não é numérico (considerado 0).`
      });
    }

    const votos = isNaN(votosNum) ? 0 : votosNum;
    const aptos = isNaN(aptosNum) ? 0 : aptosNum;

    if (mapaExistentes.has(chaveSecao)) {
      secoesExistentesCount++;
      const anterior = mapaExistentes.get(chaveSecao)!;
      if (anterior.votos !== votos) {
        conflitos.push({
          zona,
          secao,
          local_votacao_num,
          votosAntigos: anterior.votos,
          votosNovos: votos
        });
      }
    } else {
      secoesNovasCount++;
    }

    const localRef = locaisReferencia.find(
      (loc) => loc.zona === zona && (loc.secao === secao || loc.local_votacao_num === local_votacao_num)
    );

    if (!localRef || localRef.latitude === null || localRef.longitude === null) {
      avisos.push({
        tipo: 'sem_coordenada',
        texto: `Seção ${secao} (Zona ${zona}, Local ${local_votacao_num}) não possui coordenada cadastrada.`
      });
    }

    if (!totaisPorZona[zona]) {
      totaisPorZona[zona] = { votos: 0, eleitores: 0, secoes: 0 };
    }
    totaisPorZona[zona].votos += votos;
    totaisPorZona[zona].eleitores += aptos;
    totaisPorZona[zona].secoes += 1;

    totalVotos += votos;
    totalEleitores += aptos;

    linhasValidas.push({
      zona,
      secao,
      local_votacao_num,
      votos,
      aptos,
      latitude: localRef?.latitude ?? null,
      longitude: localRef?.longitude ?? null,
      nome_local: localRef?.nome_local ?? `Local nº ${local_votacao_num}`,
      bairro: localRef?.bairro ?? 'Não informado'
    });
  }

  const slug = gerarSlugCandidato(numeroCandidato, nomeCandidato);
  const nomeArquivoDestino = `${slug}.json`;
  const caminhoRelativo = `data/${ano}/${cargo}/${nomeArquivoDestino}`;

  return {
    nome: nomeCandidato.trim(),
    numero: numeroCandidato.trim(),
    cargo,
    ano: ano.trim(),
    nomeArquivoDestino,
    caminhoRelativo,
    totalLinhas: rawRows.length - 1,
    totalSecoes: secoesVistas.size,
    totalLocais: locaisVistos.size,
    totalVotos,
    totalEleitores,
    totaisPorZona,
    linhas: linhasValidas,
    colunasOriginais: headers,
    mapeamentoColunas: mapeamento,
    colunasIgnoradas,
    avisos,
    jaExisteSubstituicao: Boolean(dadosExistentesCandidato && dadosExistentesCandidato.length > 0),
    loteInfo: {
      nomeArquivo: nomeArquivo || 'arquivo.xlsx',
      totalSecoesArquivo: secoesVistas.size,
      totalVotosArquivo: totalVotos
    },
    secoesNovasCount,
    secoesExistentesCount,
    conflitos
  };
}

export function inferirConfiguracaoColuna(
  coluna: string,
  defaultAno: string = '2026',
  defaultCargo: CargoId = 'depfed'
): {
  tipo: TipoItemEleitoral;
  nome: string;
  numero: string;
  partido: string;
  cargo: CargoId;
  ano: string;
} {
  const norm = normalizarChave(coluna);

  const grupos: string[] = [];
  const reGrupo = /[(\[]([^)\]]*)[)\]]/g;
  let achado: RegExpExecArray | null = reGrupo.exec(coluna);
  while (achado !== null) {
    grupos.push(achado[1]);
    achado = reGrupo.exec(coluna);
  }
  let grupoDoNumero = '';
  for (let i = grupos.length - 1; i >= 0; i--) {
    if (/(^|\D)\d{2,5}(\D|$)/.test(grupos[i])) {
      grupoDoNumero = grupos[i];
      break;
    }
  }
  const formatoNovo = grupoDoNumero !== ''; // "Nome (15678 MDB)"

  let cargo: CargoId = defaultCargo;
  if (!formatoNovo) {
    if (norm.startsWith('depfed') || norm.includes('_depfed_') || norm.includes('deputado_federal')) {
      cargo = 'depfed';
    } else if (norm.startsWith('depest') || norm.includes('_depest_') || norm.includes('deputado_estadual')) {
      cargo = 'depest';
    } else if (norm.startsWith('vereador') || norm.startsWith('ver_') || norm.includes('vereador')) {
      cargo = 'vereador';
    }
  }

  let numero = '';
  if (formatoNovo) {
    const m = grupoDoNumero.match(/(^|\D)(\d{2,5})(\D|$)/);
    if (m) numero = m[2];
  } else {
    const m = coluna.match(/(\d{2,5})$/) || coluna.match(/_(\d{2,5})_/) || coluna.match(/(\d{2,5})/);
    if (m) numero = m[1];
  }

  const semGrupoDoNumero = formatoNovo
    ? coluna.replace(/[(\[]([^)\]]*)[)\]]/g, (tudo, dentro) => (dentro === grupoDoNumero ? ' ' : tudo))
    : coluna;
  const ruido = new Set([
    'votos', 'voto', 'qt', 'qtd', 'qtde', 'de', 'em', 'nominais', 'validos', 'pct',
    'depfed', 'depest', 'vereador', 'ver', 'deputado', 'federal', 'estadual'
  ]);
  const palavras = normalizarChave(semGrupoDoNumero)
    .split('_')
    .filter((p) => p && !/^\d+$/.test(p) && !ruido.has(p));
  const todas = (re: RegExp): boolean => palavras.length > 0 && palavras.every((p) => re.test(p));
  const temBranco = palavras.some((p) => /^branc[oa]s?$/.test(p));
  const temNulo = palavras.some((p) => /^(nul[oa]s?|anulad[oa]s?)$/.test(p));
  const soBrancosENulos = todas(/^(branc[oa]s?|nul[oa]s?|anulad[oa]s?|e)$/);
  const ehBrancosENulos = soBrancosENulos && temBranco && temNulo;
  const ehBrancos = (soBrancosENulos && temBranco && !temNulo) || (palavras.length === 0 && numero === '95');
  const ehNulos = (soBrancosENulos && temNulo && !temBranco) || (palavras.length === 0 && numero === '96');
  const ehAbstencao =
    todas(/^(abstenc[a-z]*|faltas?|faltosos|ausentes|eleitores|e)$/) && palavras.some((p) => /^(abstenc|falt|ausent)/.test(p));
  const ehComparecimento = todas(/^(comparec[a-z]*|eleitores)$/) && palavras.some((p) => p.startsWith('comparec'));

  let tipo: TipoItemEleitoral = 'candidato';
  if (formatoNovo && numero.length >= 4) {
    tipo = 'candidato';
  } else if (ehBrancos || ehNulos || ehBrancosENulos || ehAbstencao || ehComparecimento) {
    tipo = 'outros';
  } else if (palavras.includes('total') || palavras.includes('totais') || norm.includes('tot_partido')) {
    tipo = 'total_partido';
  } else if (palavras.includes('legenda') || palavras.includes('legendas')) {
    tipo = 'legenda';
  }

  let partido = '';
  if (formatoNovo) {
    const resto = grupoDoNumero
      .replace(/\d+/g, ' ')
      .replace(/[^A-Za-zÀ-ÿ ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (resto) partido = siglaConhecida(resto) || (resto.length <= 20 ? resto.toUpperCase() : '');
  }
  if (!partido && (tipo === 'legenda' || tipo === 'total_partido')) {
    const candidatas = palavras.filter((p) => !['legenda', 'legendas', 'total', 'totais', 'partido', 'tot'].includes(p));
    partido = siglaConhecida(candidatas.join(''));
    for (let i = 0; i < candidatas.length && !partido; i++) partido = siglaConhecida(candidatas[i]);
  }
  if (!partido && tipo !== 'outros' && numero.length >= 2) {
    partido = partidoPeloNumero(numero, defaultAno);
  }

  if (tipo === 'legenda' || tipo === 'total_partido') {
    if (numero.length !== 2) numero = numeroDoPartido(partido, defaultAno) || numero.substring(0, 2);
  } else if (tipo === 'outros') {
    if (ehBrancos) numero = '95';
    else if (ehNulos) numero = '96';
  }

  let nome = '';
  const siglaNoNome = partido === 'PCDOB' ? 'PCdoB' : partido === 'PTDOB' ? 'PTdoB' : partido;
  if (tipo === 'legenda') {
    nome = `${siglaNoNome || 'Partido'} Legenda`;
  } else if (tipo === 'total_partido') {
    nome = `${siglaNoNome || 'Partido'} Total`;
  } else if (tipo === 'outros') {
    if (ehBrancosENulos) nome = 'Brancos e Nulos';
    else if (ehBrancos) nome = 'Votos Brancos';
    else if (ehNulos) nome = 'Votos Nulos';
    else if (ehAbstencao) nome = 'Abstenções';
    else nome = 'Comparecimento';
  } else {
    const sobras = new Set(['votos', 'voto', 'qt', 'qtd', 'qtde', 'nominais', 'depfed', 'depest', 'vereador', 'ver', 'deputado', 'federal', 'estadual']);
    const particulas = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
    const palavrasDoNome = limparTexto(semGrupoDoNumero.replace(/[()\[\]]/g, ' '))
      .replace(/[_\-.]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w && (formatoNovo || (!/^\d+$/.test(w) && !sobras.has(normalizarChave(w)))));
    if (palavrasDoNome.length > 0) {
      nome = palavrasDoNome
        .map((w, i) => {
          const minuscula = w.toLowerCase();
          if (i > 0 && particulas.has(minuscula)) return minuscula;
          return minuscula.charAt(0).toUpperCase() + minuscula.slice(1);
        })
        .join(' ');
    } else {
      nome = numero ? `Candidato ${numero}` : coluna;
    }
  }

  return {
    tipo,
    nome,
    numero,
    partido,
    cargo,
    ano: defaultAno
  };
}

export function detectarColunasVotos(headers: string[], rawRows: string[][]): string[] {
  const colunasGeograficas = new Set([
    'nr_zona', 'num_zona', 'cd_zona', 'zona', 'nr_zona_eleitoral',
    'nr_secao', 'num_secao', 'cd_secao', 'secao', 'secao_eleitoral',
    'nr_local_votacao', 'nr_local', 'local_votacao_num', 'local_votacao', 'local', 'numero_local',
    'nm_local_votacao', 'nome_local', 'escola', 'ds_endereco', 'endereco', 'nm_bairro', 'bairro',
    'nr_cep', 'cep', 'nr_latitude', 'latitude', 'lat', 'nr_longitude', 'longitude', 'lon',
    'aa_eleicao', 'ano_eleicao', 'ano', 'qt_eleitor_secao', 'qt_aptos', 'eleitores_aptos', 'aptos', 'eleitores',
    'ds_tipo_secao_agregada', 'nr_secao_principal'
  ]);

  return headers.filter((h, colIdx) => {
    const norm = normalizarChave(h);
    if (!norm) return false;
    if (colunasGeograficas.has(norm)) return false;

    let temNumero = false;
    for (let r = 1; r < Math.min(rawRows.length, 20); r++) {
      const val = rawRows[r]?.[colIdx];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        const digitos = String(val).replace(/\D/g, '');
        if (digitos.length > 0) {
          temNumero = true;
          break;
        }
      }
    }
    return temNumero;
  });
}

export interface ColunaConfigItem {
  coluna: string;
  selecionada: boolean;
  tipo: TipoItemEleitoral;
  nome: string;
  numero: string;
  partido: string;
  cargo: CargoId;
  ano: string;
}

export function processarPreviaMultiplosItens(
  rawRows: string[][],
  colunasConfig: ColunaConfigItem[],
  locaisReferencia: LocalVotacao[] | ((ano: string) => LocalVotacao[]),
  existentes: Record<string, SecaoVotoCandidato[]>,
  nomeArquivoOriginal: string = 'planilha.xlsx',
  colunasEstrutura?: { zona?: string; secao?: string; local?: string; aptos?: string }
): PreviaMultiplosItens {
  if (rawRows.length < 2) {
    throw new Error('A planilha deve conter pelo menos uma linha de cabeçalho e uma de dados.');
  }

  const headers = rawRows[0];
  const mapeamentoGeo = identificarColunas(headers, ALIASES_CANDIDATO);
  const colZona = colunasEstrutura?.zona || mapeamentoGeo['zona'] || '';
  const colSecao = colunasEstrutura?.secao || mapeamentoGeo['secao'] || '';
  const colLocal = colunasEstrutura?.local ?? mapeamentoGeo['local_votacao_num'] ?? '';
  const colAptos = colunasEstrutura?.aptos ?? mapeamentoGeo['aptos'] ?? '';

  const idxZona = headers.indexOf(colZona);
  const idxSecao = headers.indexOf(colSecao);
  const idxLocal = colLocal ? headers.indexOf(colLocal) : -1;
  const idxAptos = colAptos ? headers.indexOf(colAptos) : -1;

  if (idxZona < 0 || idxSecao < 0) {
    throw new Error('Não foi possível identificar as colunas de Zona e Seção na planilha.');
  }

  const itensSelecionados = colunasConfig.filter((c) => c.selecionada);
  const itensResultado: PreviaItemLote[] = [];
  const cacheLocais = new Map<string, Map<string, LocalVotacao>>();
  const locaisDoAno = (ano: string): Map<string, LocalVotacao> => {
    if (!cacheLocais.has(ano)) {
      const lista = typeof locaisReferencia === 'function' ? locaisReferencia(ano) : locaisReferencia;
      const mapa = new Map<string, LocalVotacao>();
      (lista || []).forEach((l) => mapa.set(`${l.zona}_${l.secao}`, l));
      cacheLocais.set(ano, mapa);
    }
    return cacheLocais.get(ano)!;
  };

  for (const cfg of itensSelecionados) {
    const idxColunaVoto = headers.indexOf(cfg.coluna);
    if (idxColunaVoto < 0) continue;

    const ano = cfg.ano.trim();
    const numero = cfg.numero.trim().replace(/\D/g, '');
    const nome = cfg.nome.trim();
    const candId = montarIdItem(ano, cfg.cargo, cfg.tipo, numero, nome);
    const caminhoArquivo = montarCaminhoItem(ano, cfg.cargo, numero, nome);
    const nomeArquivoDestino = caminhoArquivo.split('/').pop() || '';
    const mapaLocais = locaisDoAno(ano);

    const mapaExistentes = new Map<string, SecaoVotoCandidato>();
    (existentes[candId] || []).forEach((s) => mapaExistentes.set(`${s.zona}_${s.secao}`, s));

    const porSecao = new Map<
      string,
      { zona: string; secao: string; local: string; aptos: number; valores: number[] }
    >();
    const valoresInvalidos: PreviaItemLote['valoresInvalidos'] = [];
    let semDado = 0;

    for (let i = 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row || row.length === 0 || row.every((c) => !c)) continue;

      const zona = normalizarZona(row[idxZona]);
      const secao = normalizarSecao(row[idxSecao]);
      if (!zona || !secao) continue;

      const lido = lerNumeroDeVotos(row[idxColunaVoto]);
      if (lido.invalido) {
        valoresInvalidos.push({ linha: i + 1, zona, secao, valor: String(row[idxColunaVoto]) });
        continue;
      }
      if (lido.votos === null) {
        semDado++;
        continue;
      }

      const localNumRaw = idxLocal >= 0 ? String(row[idxLocal] || '') : '';
      const local = localNumRaw.replace(/\D/g, '') || '0';
      const aptosRaw = idxAptos >= 0 ? String(row[idxAptos] || '') : '';
      const aptos = parseInt(aptosRaw.replace(/\D/g, ''), 10) || 0;

      const chave = `${zona}_${secao}`;
      const jaVista = porSecao.get(chave);
      if (jaVista) {
        jaVista.valores.push(lido.votos);
        if (local !== '0') jaVista.local = local;
        if (aptos > 0) jaVista.aptos = aptos;
      } else {
        porSecao.set(chave, { zona, secao, local, aptos, valores: [lido.votos] });
      }
    }

    let totalVotos = 0;
    let secoesNovasCount = 0;
    let secoesIguaisCount = 0;
    let secoesConflitosCount = 0;
    let secoesSemLocalCount = 0;
    const conflitos: ConflitoSecaoLote[] = [];
    const repetidas: PreviaItemLote['repetidas'] = [];
    const linhas: LinhaPreviaItem[] = [];

    porSecao.forEach((reg, chave) => {
      const votos = reg.valores[reg.valores.length - 1];
      totalVotos += votos;
      if (reg.valores.length > 1) {
        repetidas.push({ zona: reg.zona, secao: reg.secao, valores: reg.valores, usado: votos });
      }

      const locRef = mapaLocais.get(chave);
      if (!locRef) secoesSemLocalCount++;

      let statusLinha: LinhaPreviaItem['status'] = 'nova';
      let votoAntigo: number | undefined = undefined;
      const existente = mapaExistentes.get(chave);
      if (existente) {
        votoAntigo = existente.votos;
        if (existente.votos === votos) {
          statusLinha = 'igual';
          secoesIguaisCount++;
        } else {
          statusLinha = 'conflito';
          secoesConflitosCount++;
          conflitos.push({
            zona: reg.zona,
            secao: reg.secao,
            local_votacao_num: reg.local,
            votosAntigos: existente.votos,
            votosNovos: votos,
            loteAntigoNome: existente.loteId
          });
        }
      } else {
        secoesNovasCount++;
      }

      linhas.push({
        zona: reg.zona,
        secao: reg.secao,
        local_votacao_num: reg.local,
        votos,
        aptos: reg.aptos,
        latitude: locRef?.latitude ?? null,
        longitude: locRef?.longitude ?? null,
        nome_local: locRef?.nome_local ?? (reg.local !== '0' ? `Local nº ${reg.local}` : 'Seção fora do cadastro de locais'),
        bairro: locRef?.bairro ?? 'Não informado',
        status: statusLinha,
        votoAntigo
      });
    });

    itensResultado.push({
      colunaOriginal: cfg.coluna,
      tipo: cfg.tipo,
      nome,
      numero,
      partido: cfg.partido.trim().toUpperCase(),
      cargo: cfg.cargo,
      ano,
      candidatoId: candId,
      nomeArquivoDestino,
      caminhoArquivo,
      totalVotosArquivo: totalVotos,
      totalSecoesArquivo: porSecao.size,
      secoesNovasCount,
      secoesIguaisCount,
      secoesConflitosCount,
      secoesRepetidasArquivoCount: repetidas.length,
      secoesSemDadoCount: semDado,
      valoresInvalidos,
      repetidas,
      secoesSemLocalCount,
      conflitos,
      linhas,
      acaoConflito: 'substituir'
    });
  }

  const colunasReconhecidas = new Set(
    [colZona, colSecao, colLocal, colAptos, ...itensSelecionados.map((i) => i.coluna)].filter(Boolean)
  );
  const colunasIgnoradas = headers.filter((h) => !colunasReconhecidas.has(h));

  return {
    nomeArquivoOriginal,
    totalLinhasArquivo: rawRows.length - 1,
    itens: itensResultado,
    colunasIgnoradas
  };
}

export function detectarDuplicadosEmCandidato(
  cand: CandidatoInfo,
  secoes: SecaoVotoCandidato[]
): DuplicadoSecaoDetalhe[] {
  const mapa = new Map<string, SecaoVotoCandidato[]>();
  secoes.forEach((s) => {
    const chave = `${s.zona}_${s.secao}`;
    if (!mapa.has(chave)) {
      mapa.set(chave, []);
    }
    mapa.get(chave)!.push(s);
  });

  const mapaLotes = new Map<string, LoteEnvio>();
  (cand.lotes || []).forEach((l) => {
    mapaLotes.set(l.id, l);
  });

  const duplicados: DuplicadoSecaoDetalhe[] = [];

  mapa.forEach((lista, chave) => {
    if (lista.length > 1) {
      const [zona, secao] = chave.split('_');
      duplicados.push({
        ano: cand.ano,
        cargo: cand.cargo,
        candidatoId: cand.id,
        candidatoNome: cand.nome,
        tipo: cand.tipo || 'candidato',
        partido: cand.partido,
        numero: cand.numero,
        zona,
        secao,
        ocorrencias: lista.map((item, idx) => {
          const lote = item.loteId ? mapaLotes.get(item.loteId) : undefined;
          return {
            loteId: item.loteId || `lote_${idx}`,
            loteNome: lote?.nomeArquivo || item.loteId || 'Envio sem identificador',
            dataHora: lote?.dataHora || item.dataHora || 'Data não registrada',
            votos: item.votos
          };
        })
      });
    }
  });

  return duplicados;
}

export function resolverDuplicadosCandidato(
  secoes: SecaoVotoCandidato[],
  escolhasPorSecao: Record<string, string>
): SecaoVotoCandidato[] {
  const secoesResolvidas: SecaoVotoCandidato[] = [];
  const secoesVistas = new Set<string>();

  for (const s of secoes) {
    const chave = `${s.zona}_${s.secao}`;
    const loteEscolhido = escolhasPorSecao[chave];

    if (loteEscolhido) {
      if (s.loteId === loteEscolhido && !secoesVistas.has(chave)) {
        secoesResolvidas.push(s);
        secoesVistas.add(chave);
      }
    } else {
      if (!secoesVistas.has(chave)) {
        secoesResolvidas.push(s);
        secoesVistas.add(chave);
      }
    }
  }

  return secoesResolvidas;
}

export function processarArquivoEleitorado(rawRows: string[][]): SecaoEleitorado[] {
  if (rawRows.length < 2) return [];

  const headers = rawRows[0];
  const idxZona = headers.findIndex((h) => ['zona', 'nr_zona'].includes(normalizarChave(h)));
  const idxSecao = headers.findIndex((h) => ['secao', 'nr_secao'].includes(normalizarChave(h)));
  const idxAptos = headers.findIndex((h) =>
    ['aptos', 'eleitores', 'eleitores_aptos', 'total_aptos', 'qt_aptos', 'qt_eleitor_secao'].includes(normalizarChave(h))
  );

  const result: SecaoEleitorado[] = [];

  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (row.length === 0) continue;

    const zona = idxZona >= 0 ? normalizarZona(row[idxZona]) : '';
    const secao = idxSecao >= 0 ? normalizarSecao(row[idxSecao]) : '';
    const aptosStr = idxAptos >= 0 ? row[idxAptos].replace(/\D/g, '') : '0';
    const aptos = parseInt(aptosStr, 10) || 0;

    if (zona && secao) {
      result.push({ zona, secao, aptos });
    }
  }

  return result;
}

export function processarArquivoCorrespondencia(rawRows: string[][]): SecaoCorrespondencia[] {
  if (rawRows.length < 2) return [];

  const headers = rawRows[0];
  const idxZona = headers.findIndex((h) => normalizarChave(h).includes('zona') && !normalizarChave(h).includes('destino'));
  const idxSecao = headers.findIndex((h) => normalizarChave(h).includes('secao') && !normalizarChave(h).includes('destino') && !normalizarChave(h).includes('principal'));
  const idxZonaDest = headers.findIndex((h) => normalizarChave(h).includes('zona_destino') || normalizarChave(h).includes('zonadest'));
  const idxSecaoDest = headers.findIndex((h) =>
    normalizarChave(h).includes('secao_destino') ||
    normalizarChave(h).includes('nr_secao_principal') ||
    normalizarChave(h).includes('secao_principal')
  );
  const idxSituacao = headers.findIndex((h) =>
    normalizarChave(h).includes('situacao') ||
    normalizarChave(h).includes('status') ||
    normalizarChave(h).includes('ds_tipo_secao_agregada')
  );

  const result: SecaoCorrespondencia[] = [];

  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (row.length === 0) continue;

    const zona = idxZona >= 0 ? normalizarZona(row[idxZona]) : '';
    const secao = idxSecao >= 0 ? normalizarSecao(row[idxSecao]) : '';
    const zona_destino = idxZonaDest >= 0 ? normalizarZona(row[idxZonaDest]) : zona;
    const secao_destino = idxSecaoDest >= 0 ? normalizarSecao(row[idxSecaoDest]) : '';
    const situacao = idxSituacao >= 0 ? row[idxSituacao].trim() : 'Agregada';

    if (zona && secao && secao_destino && secao_destino !== '-1' && secao_destino !== secao) {
      result.push({
        zona,
        secao,
        zona_destino,
        secao_destino,
        situacao: situacao || 'Agregada'
      });
    }
  }

  return result;
}
