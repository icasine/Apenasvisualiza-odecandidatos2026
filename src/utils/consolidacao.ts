
import {
  CandidatoInfo,
  CorrespondenciaLocaisArquivo,
  LocalAgrupado,
  LocalVotacao,
  SecaoVisualizacao,
  SecaoVotoCandidato
} from '../types/election';
import { chaveDaPessoa } from './itens';

export interface DadosDoAno {
  ano: string;
  locais: LocalVotacao[];
  eleitorado: Record<string, number>;
  agregadas: Record<string, string>;
  locaisEmprestados?: boolean;
  agregadasEmprestadas?: boolean;
}

export interface EscolaDoAno {
  ano: string;
  chave: string;
  zona: string;
  local_num: string;
  nome: string;
  endereco: string;
  bairro: string;
  cep?: string;
  latitude: number | null;
  longitude: number | null;
  secoes: LocalVotacao[];
}

export type MetodoLigacao = 'referencia' | 'manual' | 'manual_sem' | 'numero' | 'nome' | 'distancia' | 'sem';

export interface LigacaoEscola {
  id: string;
  metodo: MetodoLigacao;
}

export const NOMES_METODO: Record<MetodoLigacao, string> = {
  referencia: 'Ano de referência',
  manual: 'Corrigida à mão',
  manual_sem: 'Marcada à mão como sem correspondência',
  numero: 'Mesmo número e nome parecido',
  nome: 'Mesmo nome',
  distancia: 'Até 150 metros',
  sem: 'Sem correspondência'
};

export interface VotoSemLocalizacao {
  candidatoId: string;
  ano: string;
  zona: string;
  secao: string;
  votos: number;
}

export interface ResultadoConsolidacao {
  locais: LocalAgrupado[];
  semLocalizacao: VotoSemLocalizacao[];
  anos: string[];
  anoBase: string;
  avisos: string[];
}

const chaveSecao = (zona: string, secao: string): string => `${zona}_${secao}`;

export function escolasDoAno(dados: DadosDoAno | undefined): EscolaDoAno[] {
  if (!dados) return [];
  const mapa = new Map<string, EscolaDoAno>();
  dados.locais.forEach((l) => {
    const chave = `${l.zona}_${l.local_votacao_num}`;
    let e = mapa.get(chave);
    if (!e) {
      e = {
        ano: dados.ano,
        chave,
        zona: l.zona,
        local_num: l.local_votacao_num,
        nome: l.nome_local,
        endereco: l.endereco,
        bairro: l.bairro,
        cep: l.cep,
        latitude: l.latitude,
        longitude: l.longitude,
        secoes: []
      };
      mapa.set(chave, e);
    }
    if ((e.latitude === null || e.longitude === null) && l.latitude !== null && l.longitude !== null) {
      e.latitude = l.latitude;
      e.longitude = l.longitude;
    }
    e.secoes.push(l);
  });
  return Array.from(mapa.values());
}

const TROCAS_NOME: Array<[RegExp, string]> = [
  [/\bESCOLA MUNICIPAL\b/g, 'EM'],
  [/\bESCOLA ESTADUAL\b/g, 'EE'],
  [/\bE M\b/g, 'EM'],
  [/\bE E\b/g, 'EE'],
  [/\bCENTRO MUNICIPAL DE EDUCACAO INFANTIL\b/g, 'CMEI'],
  [/\bUNIDADE MUNICIPAL DE EDUCACAO INFANTIL\b/g, 'UMEI'],
  [/\bPROFESSORA\b/g, 'PROF'],
  [/\bPROFESSOR\b/g, 'PROF'],
  [/\bPROFA\b/g, 'PROF'],
  [/\bDOUTORA\b/g, 'DR'],
  [/\bDOUTOR\b/g, 'DR'],
  [/\bDRA\b/g, 'DR'],
  [/\bDONA\b/g, 'D'],
  [/\bSANTA\b/g, 'STA'],
  [/\bSANTO\b/g, 'STO'],
  [/\bSAO\b/g, 'S'],
  [/\bNOSSA SENHORA\b/g, 'NS'],
  [/\bN S\b/g, 'NS'],
  [/\bPRESIDENTE\b/g, 'PRES'],
  [/\bGOVERNADOR\b/g, 'GOV'],
  [/\bVEREADOR\b/g, 'VER'],
  [/\bDEPUTADO\b/g, 'DEP'],
  [/\bCORONEL\b/g, 'CEL'],
  [/\bENGENHEIRO\b/g, 'ENG']
];
const PALAVRAS_VAZIAS = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'A', 'O']);

export function normalizarNomeEscola(nome: string): string[] {
  let n = String(nome || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
  TROCAS_NOME.forEach(([de, para]) => {
    n = n.replace(de, para);
  });
  return n.split(' ').filter((p) => p && !PALAVRAS_VAZIAS.has(p));
}

export function semelhancaDeNomes(a: string, b: string): number {
  const ta = new Set(normalizarNomeEscola(a));
  const tb = new Set(normalizarNomeEscola(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let comuns = 0;
  ta.forEach((p) => {
    if (tb.has(p)) comuns++;
  });
  return comuns / (ta.size + tb.size - comuns);
}

export function distanciaEmMetros(
  a: { latitude: number | null; longitude: number | null },
  b: { latitude: number | null; longitude: number | null }
): number | null {
  if (a.latitude === null || a.longitude === null || b.latitude === null || b.longitude === null) return null;
  const R = 6371000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const DISTANCIA_MAXIMA_METROS = 150;

interface Alvo {
  id: string;
  escola: EscolaDoAno;
}

export function calcularCorrespondencia(
  porAno: Record<string, EscolaDoAno[]>,
  referencia: string,
  manual: CorrespondenciaLocaisArquivo | null
): Map<string, LigacaoEscola> {
  const ligacoes = new Map<string, LigacaoEscola>();
  const alvos: Alvo[] = [];

  (porAno[referencia] || []).forEach((e) => {
    ligacoes.set(`${referencia}:${e.chave}`, { id: e.chave, metodo: 'referencia' });
    alvos.push({ id: e.chave, escola: e });
  });

  const outrosAnos = Object.keys(porAno)
    .filter((a) => a !== referencia)
    .sort()
    .reverse();

  outrosAnos.forEach((ano) => {
    const escolas = porAno[ano] || [];
    const manuais = (manual && manual.anos && manual.anos[ano]) || {};
    const pendentes: EscolaDoAno[] = [];
    const usados = new Set<string>();

    escolas.forEach((e) => {
      if (Object.prototype.hasOwnProperty.call(manuais, e.chave)) {
        const destino = String(manuais[e.chave] ?? '');
        if (destino === '') {
          ligacoes.set(`${ano}:${e.chave}`, { id: `${ano}:${e.chave}`, metodo: 'manual_sem' });
        } else {
          ligacoes.set(`${ano}:${e.chave}`, { id: destino, metodo: 'manual' });
          usados.add(destino);
        }
      } else {
        pendentes.push(e);
      }
    });

    const ligar = (e: EscolaDoAno, alvo: Alvo, metodo: MetodoLigacao) => {
      ligacoes.set(`${ano}:${e.chave}`, { id: alvo.id, metodo });
      usados.add(alvo.id);
    };
    const livres = () => alvos.filter((a) => !usados.has(a.id));

    let restantes: EscolaDoAno[] = [];
    pendentes.forEach((e) => {
      const alvo = livres().find(
        (a) => a.escola.zona === e.zona && a.escola.local_num === e.local_num && semelhancaDeNomes(a.escola.nome, e.nome) >= 0.4
      );
      if (alvo) ligar(e, alvo, 'numero');
      else restantes.push(e);
    });

    let depoisDoNome: EscolaDoAno[] = [];
    restantes.forEach((e) => {
      const candidatos = livres()
        .map((a) => ({ a, s: semelhancaDeNomes(a.escola.nome, e.nome) }))
        .filter((x) => x.s >= 0.8)
        .sort((x, y) => {
          if (y.s !== x.s) return y.s - x.s;
          const dx = distanciaEmMetros(x.a.escola, e) ?? Infinity;
          const dy = distanciaEmMetros(y.a.escola, e) ?? Infinity;
          return dx - dy;
        });
      if (candidatos.length > 0) ligar(e, candidatos[0].a, 'nome');
      else depoisDoNome.push(e);
    });

    const semLigacao: EscolaDoAno[] = [];
    depoisDoNome.forEach((e) => {
      let melhor: { a: Alvo; d: number } | null = null;
      livres().forEach((a) => {
        const d = distanciaEmMetros(a.escola, e);
        if (d !== null && d <= DISTANCIA_MAXIMA_METROS && (!melhor || d < melhor.d)) melhor = { a, d };
      });
      if (melhor) ligar(e, (melhor as { a: Alvo; d: number }).a, 'distancia');
      else semLigacao.push(e);
    });

    semLigacao.forEach((e) => {
      const id = `${ano}:${e.chave}`;
      ligacoes.set(id, { id, metodo: 'sem' });
      alvos.push({ id, escola: e });
    });
  });

  return ligacoes;
}

interface EscolaEmConstrucao {
  id: string;
  porAno: Map<string, EscolaDoAno[]>;
}

export function consolidar(p: {
  candidatos: CandidatoInfo[];
  votos: Record<string, SecaoVotoCandidato[]>;
  dadosPorAno: Record<string, DadosDoAno>;
  referencia: string;
  manual: CorrespondenciaLocaisArquivo | null;
  excluidosDaSoma: Set<string>;
  comparar?: { de: string; para: string } | null;
}): ResultadoConsolidacao {
  const { candidatos, votos, dadosPorAno, manual, excluidosDaSoma } = p;
  const avisos: string[] = [];

  const anosMarcados = Array.from(new Set(candidatos.map((c) => String(c.ano)))).sort();
  const referencia = dadosPorAno[p.referencia] ? p.referencia : anosMarcados[anosMarcados.length - 1] || p.referencia;
  const anos = anosMarcados.length > 0 ? anosMarcados : [referencia];
  const anoBase = anos[anos.length - 1];

  const escolasPorAno: Record<string, EscolaDoAno[]> = {};
  Array.from(new Set([...anos, referencia])).forEach((ano) => {
    escolasPorAno[ano] = escolasDoAno(dadosPorAno[ano]);
  });

  const ligacoes = calcularCorrespondencia(escolasPorAno, referencia, manual);

  const construcao = new Map<string, EscolaEmConstrucao>();
  anos.forEach((ano) => {
    (escolasPorAno[ano] || []).forEach((e) => {
      const id = ligacoes.get(`${ano}:${e.chave}`)?.id || `${ano}:${e.chave}`;
      let c = construcao.get(id);
      if (!c) {
        c = { id, porAno: new Map() };
        construcao.set(id, c);
      }
      if (!c.porAno.has(ano)) c.porAno.set(ano, []);
      c.porAno.get(ano)!.push(e);
    });
  });

  const indiceVotos = new Map<string, Map<string, SecaoVotoCandidato>>();
  const somadasPorAno: Record<string, Set<string>> = {};
  const mudaramPorAno: Record<string, Set<string>> = {};
  const localAtualPorAno: Record<string, Map<string, string>> = {};
  const numeroDoLocal = (v: unknown) => String(v ?? '').replace(/\D/g, '').replace(/^0+/, '');
  candidatos.forEach((cand) => {
    const porSecao = new Map<string, SecaoVotoCandidato>();
    const d = dadosPorAno[cand.ano];
    const emprestado = Boolean(d?.locaisEmprestados);
    if (emprestado && !localAtualPorAno[cand.ano]) {
      const mapa = new Map<string, string>();
      d!.locais.forEach((loc) => mapa.set(chaveSecao(loc.zona, loc.secao), numeroDoLocal(loc.local_votacao_num)));
      localAtualPorAno[cand.ano] = mapa;
      somadasPorAno[cand.ano] = new Set();
      mudaramPorAno[cand.ano] = new Set();
    }
    (votos[cand.id] || []).forEach((r) => {
      const k = chaveSecao(r.zona, r.secao);
      if (emprestado) {
        const daEpoca = numeroDoLocal(r.local_votacao_num);
        const atual = localAtualPorAno[cand.ano].get(k);
        if (daEpoca && atual && daEpoca !== atual) mudaramPorAno[cand.ano].add(k);
      }
      const destino = emprestado && d!.agregadasEmprestadas ? d!.agregadas[k] : undefined;
      if (destino) {
        const [zonaDestino, secaoDestino] = destino.includes('_') ? destino.split('_') : [r.zona, destino];
        const kDestino = chaveSecao(zonaDestino, secaoDestino);
        const jaTem = porSecao.get(kDestino);
        porSecao.set(kDestino, jaTem ? { ...jaTem, votos: (jaTem.votos || 0) + (r.votos || 0) } : { ...r, zona: zonaDestino, secao: secaoDestino, aptos: undefined });
        somadasPorAno[cand.ano].add(k);
        return;
      }
      const jaTem = porSecao.get(k);
      porSecao.set(k, jaTem && emprestado && d!.agregadasEmprestadas ? { ...r, votos: (jaTem.votos || 0) + (r.votos || 0) } : r);
    });
    indiceVotos.set(cand.id, porSecao);
  });

  const listarSecoes = (chaves: Set<string>): string => {
    const porZona = new Map<string, number[]>();
    chaves.forEach((k) => {
      const [zona, secao] = k.split('_');
      const lista = porZona.get(zona) || [];
      lista.push(parseInt(secao, 10));
      porZona.set(zona, lista);
    });
    return Array.from(porZona.entries())
      .map(([zona, lista]) => `zona ${parseInt(zona, 10) || zona}: ${lista.sort((x, y) => x - y).join(', ')}`)
      .join('; ');
  };
  anos.forEach((ano) => {
    if (!dadosPorAno[ano]?.locaisEmprestados) return;
    let nota = `${ano} está sendo mostrado nas escolas de ${referencia}, onde cada seção vota hoje.`;
    const mudaram = mudaramPorAno[ano];
    if (mudaram && mudaram.size > 0) {
      nota += mudaram.size <= 12
        ? ` ${mudaram.size === 1 ? 'Uma seção votava' : `${mudaram.size} seções votavam`} em outro local em ${ano} (${listarSecoes(mudaram)}).`
        : ` ${mudaram.size} seções votavam em outro local em ${ano}.`;
    }
    const somadas = somadasPorAno[ano];
    if (somadas && somadas.size > 0) {
      nota += ` Os votos de ${somadas.size === 1 ? 'uma seção que hoje é agregada foram somados' : `${somadas.size} seções que hoje são agregadas foram somados`} à seção principal.`;
    }
    avisos.push(nota);
  });

  const agregadasPorDestino = new Map<string, Array<{ secao: string; aptos: number }>>();
  const secoesCadastradas: Record<string, Set<string>> = {};
  anos.forEach((ano) => {
    const d = dadosPorAno[ano];
    secoesCadastradas[ano] = new Set();
    if (!d) return;
    d.locais.forEach((loc) => {
      const k = chaveSecao(loc.zona, loc.secao);
      secoesCadastradas[ano].add(k);
      const destino = d.agregadas[k];
      if (destino) {
        const chaveDestino = destino.includes('_') ? destino : `${loc.zona}_${destino}`;
        const lista = agregadasPorDestino.get(`${ano}|${chaveDestino}`) || [];
        lista.push({ secao: loc.secao, aptos: d.eleitorado[k] || loc.aptos || 0 });
        agregadasPorDestino.set(`${ano}|${chaveDestino}`, lista);
      }
    });
  });

  const candidatosPorAno: Record<string, CandidatoInfo[]> = {};
  candidatos.forEach((c) => {
    if (!candidatosPorAno[c.ano]) candidatosPorAno[c.ano] = [];
    candidatosPorAno[c.ano].push(c);
  });
  const variosAnos = anos.length > 1;

  const lista: LocalAgrupado[] = [];

  construcao.forEach((c) => {
    const anosPresentes = Array.from(c.porAno.keys()).sort();
    const anoExibicao = anosPresentes[anosPresentes.length - 1];
    const principal = c.porAno.get(anoExibicao)![0];

    const local: LocalAgrupado = {
      key: c.id,
      zona: principal.zona,
      local_num: principal.local_num,
      nome_local: principal.nome,
      endereco: principal.endereco,
      bairro: principal.bairro,
      latitude: principal.latitude,
      longitude: principal.longitude,
      secoes: [],
      totalEleitoresAptos: 0,
      votosPorCandidato: {},
      totalVotosMarcados: 0,
      pctSobreEleitores: 0,
      anosPresentes,
      eleitoresPorAno: {},
      semCorrespondencia: []
    };

    candidatos.forEach((cand) => {
      if (!c.porAno.has(cand.ano)) local.semCorrespondencia!.push(cand.id);
      else local.votosPorCandidato[cand.id] = 0;
    });

    const secoesVis = new Map<string, SecaoVisualizacao>();

    [...anosPresentes].reverse().forEach((ano) => {
      const d = dadosPorAno[ano];
      const candsDoAno = candidatosPorAno[ano] || [];
      let eleitoresDoAno = 0;

      c.porAno.get(ano)!.forEach((escola) => {
        escola.secoes.forEach((loc) => {
          const k = chaveSecao(loc.zona, loc.secao);
          const destinoAgregada = d?.agregadas[k];
          const isAgregada = Boolean(destinoAgregada);
          let aptosDeArquivo = d?.eleitorado[k] || loc.aptos || 0;

          const votosPorCand: Record<string, number> = {};
          let somaVotosSecao = 0;
          candsDoAno.forEach((cand) => {
            const row = indiceVotos.get(cand.id)?.get(k);
            if (row) {
              const v = row.votos || 0;
              votosPorCand[cand.id] = v;
              if (!excluidosDaSoma.has(cand.id)) somaVotosSecao += v;
              if (row.aptos && row.aptos > aptosDeArquivo) aptosDeArquivo = row.aptos;
            } else {
              votosPorCand[cand.id] = 0;
            }
          });

          eleitoresDoAno += aptosDeArquivo;

          if (!isAgregada) {
            local.totalVotosMarcados += somaVotosSecao;
            candsDoAno.forEach((cand) => {
              local.votosPorCandidato[cand.id] = (local.votosPorCandidato[cand.id] || 0) + (votosPorCand[cand.id] || 0);
            });
          }

          const existente = secoesVis.get(k);
          if (existente) {
            existente.aptosPorAno![ano] = aptosDeArquivo;
            if (!isAgregada) {
              Object.assign(existente.votosPorCandidato, votosPorCand);
              existente.votosTotalMarcados += somaVotosSecao;
            }
            return;
          }

          let secoesAgregadasAEsta: string[] = [];
          let aptosBaseCalculo = aptosDeArquivo;
          const numSecao = parseInt(loc.secao.replace(/\D/g, ''), 10) || loc.secao;
          let descricaoSecao = `Seção ${numSecao}: ${aptosDeArquivo.toLocaleString('pt-BR')} eleitores`;

          if (isAgregada) {
            const destSec = destinoAgregada!.includes('_') ? destinoAgregada!.split('_')[1] : destinoAgregada!;
            const numDest = parseInt(destSec.replace(/\D/g, ''), 10) || destSec;
            descricaoSecao = `Seção ${numSecao}: agregada à seção ${numDest} (votos apurados na ${numDest})`;
          } else {
            const agregadasAEsta = agregadasPorDestino.get(`${ano}|${k}`) || [];
            if (agregadasAEsta.length > 0) {
              secoesAgregadasAEsta = agregadasAEsta.map((a) => String(parseInt(a.secao.replace(/\D/g, ''), 10) || a.secao));
              const aptosAgregadas = agregadasAEsta.reduce((acc, a) => acc + a.aptos, 0);
              aptosBaseCalculo = aptosDeArquivo + aptosAgregadas;
              const textoLista =
                secoesAgregadasAEsta.length === 1
                  ? `com a ${secoesAgregadasAEsta[0]} agregada`
                  : `com as ${secoesAgregadasAEsta.join(', ')} agregadas`;
              descricaoSecao = `Seção ${numSecao} (${textoLista}): ${aptosBaseCalculo.toLocaleString('pt-BR')} eleitores`;
            }
          }

          secoesVis.set(k, {
            zona: loc.zona,
            secao: loc.secao,
            local_num: loc.local_votacao_num,
            nome_local: loc.nome_local,
            endereco: loc.endereco,
            bairro: loc.bairro,
            latitude: loc.latitude,
            longitude: loc.longitude,
            aptos: aptosDeArquivo,
            isAgregada,
            secaoDestino: destinoAgregada ? destinoAgregada.split('_')[1] : undefined,
            zonaDestino: destinoAgregada ? destinoAgregada.split('_')[0] : undefined,
            secoesAgregadasAEsta,
            aptosBaseCalculo,
            descricaoSecao,
            votosPorCandidato: isAgregada ? {} : votosPorCand,
            votosTotalMarcados: isAgregada ? 0 : somaVotosSecao,
            pctSobreEleitores: 0,
            anoDoCadastro: ano,
            aptosPorAno: { [ano]: aptosDeArquivo }
          });
        });
      });

      local.eleitoresPorAno![ano] = eleitoresDoAno;
    });

    secoesVis.forEach((s) => {
      s.pctSobreEleitores = !s.isAgregada && s.aptosBaseCalculo > 0 ? (s.votosTotalMarcados / s.aptosBaseCalculo) * 100 : 0;
      local.secoes.push(s);
    });

    local.totalEleitoresAptos = local.eleitoresPorAno![anoExibicao] || 0;
    if (!variosAnos) {
      local.pctSobreEleitores = local.totalEleitoresAptos > 0 ? (local.totalVotosMarcados / local.totalEleitoresAptos) * 100 : 0;
    } else {
      const base = anosPresentes
        .filter((a) => (candidatosPorAno[a] || []).some((cand) => !excluidosDaSoma.has(cand.id)))
        .reduce((acc, a) => acc + (local.eleitoresPorAno![a] || 0), 0);
      local.pctSobreEleitores = base > 0 ? (local.totalVotosMarcados / base) * 100 : 0;
    }

    lista.push(local);
  });

  if (p.comparar && p.comparar.de && p.comparar.para) {
    const de = candidatos.find((c) => c.id === p.comparar!.de);
    const para = candidatos.find((c) => c.id === p.comparar!.para);
    if (de && para && de.id !== para.id) {
      lista.forEach((loc) => {
        const temDe = !loc.semCorrespondencia!.includes(de.id);
        const temPara = !loc.semCorrespondencia!.includes(para.id);
        const votosDe = temDe ? loc.votosPorCandidato[de.id] || 0 : null;
        const votosPara = temPara ? loc.votosPorCandidato[para.id] || 0 : null;
        const elDe = loc.eleitoresPorAno![de.ano] || 0;
        const elPara = loc.eleitoresPorAno![para.ano] || 0;
        const pctDe = votosDe !== null && elDe > 0 ? (votosDe / elDe) * 100 : null;
        const pctPara = votosPara !== null && elPara > 0 ? (votosPara / elPara) * 100 : null;
        loc.comparacao = {
          deId: de.id,
          paraId: para.id,
          votosDe,
          votosPara,
          diferencaVotos: votosDe !== null && votosPara !== null ? votosPara - votosDe : null,
          pctDe,
          pctPara,
          diferencaPct: pctDe !== null && pctPara !== null ? pctPara - pctDe : null
        };
      });
    }
  }

  const semLocalizacao: VotoSemLocalizacao[] = [];
  candidatos.forEach((cand) => {
    const cadastradas = secoesCadastradas[cand.ano] || new Set<string>();
    indiceVotos.get(cand.id)?.forEach((row, k) => {
      if (!cadastradas.has(k) && (row.votos || 0) > 0) {
        semLocalizacao.push({ candidatoId: cand.id, ano: cand.ano, zona: row.zona, secao: row.secao, votos: row.votos || 0 });
      }
    });
  });

  return { locais: lista, semLocalizacao, anos, anoBase, avisos };
}

export function sugerirComparacao(candidatos: CandidatoInfo[]): { de: string; para: string } | null {
  const norm = (s?: string) => String(s || '').trim().toLowerCase();
  for (let i = 0; i < candidatos.length; i++) {
    for (let j = i + 1; j < candidatos.length; j++) {
      const a = candidatos[i];
      const b = candidatos[j];
      if (a.ano === b.ano) continue;
      const mesmaPessoa = chaveDaPessoa(a) !== '' && chaveDaPessoa(a) === chaveDaPessoa(b);
      const mesmoNumero = a.numero !== '' && a.numero === b.numero && norm(a.pessoa) === '' && norm(b.pessoa) === '';
      if (mesmaPessoa || mesmoNumero) {
        return Number(a.ano) < Number(b.ano) ? { de: a.id, para: b.id } : { de: b.id, para: a.id };
      }
    }
  }
  return null;
}
