import { CandidatoInfo, SecaoVotoCandidato } from '../types/election';
import { Federacao, chavePartido, federacaoDoPartido } from './perfis';

export const nomeCurtoDaFederacao = (f: Federacao): string => 'Fed. ' + f.nome.replace(/^federa[cç][aã]o\s+/i, '');
export const rotuloDaFederacao = (f: Federacao): string => `${nomeCurtoDaFederacao(f)} (${f.partidos.join(', ')})`;
export const ehItemDePartido = (c: { tipo?: string }): boolean => c.tipo === 'total_partido' || c.tipo === 'legenda';
export const anosComFederacao = (federacoes: Federacao[], anos: string[]): string[] => anos.filter((a) => federacoes.some((f) => f.anos.includes(String(a))));

export function partidoComFederacao(c: { partido?: string; ano?: string | number }, federacoes: Federacao[]): string {
  const sigla = String(c.partido || '').trim();
  const fed = sigla ? federacaoDoPartido(federacoes, sigla, String(c.ano || '')) : null;
  return fed ? `${sigla} · ${nomeCurtoDaFederacao(fed)}` : sigla;
}

export interface VisaoComFederacoes {
  itens: CandidatoInfo[];
  votos: Record<string, SecaoVotoCandidato[]>;
  excluidos: Set<string>;
}

export function juntarItensDeFederacao(
  itens: CandidatoInfo[],
  votos: Record<string, SecaoVotoCandidato[]>,
  federacoes: Federacao[],
  excluidosDaSoma: Set<string>
): VisaoComFederacoes {
  const grupos = new Map<string, { fed: Federacao; membros: CandidatoInfo[] }>();
  const grupoDoItem = new Map<string, string>();
  itens.forEach((c) => {
    if (!ehItemDePartido(c)) return;
    const fed = federacaoDoPartido(federacoes, c.partido, c.ano);
    if (!fed) return;
    const chave = `fed:${c.tipo}:${c.ano}:${c.cargo}:${chavePartido(fed.nome)}${excluidosDaSoma.has(c.id) ? ':fora' : ''}`;
    const g = grupos.get(chave);
    if (g) g.membros.push(c);
    else grupos.set(chave, { fed, membros: [c] });
    grupoDoItem.set(c.id, chave);
  });

  const saida: CandidatoInfo[] = [];
  const votosDaVisao: Record<string, SecaoVotoCandidato[]> = { ...votos };
  const excluidos = new Set<string>(excluidosDaSoma);
  const feitos = new Set<string>();
  itens.forEach((c) => {
    const chave = grupoDoItem.get(c.id);
    const g = chave ? grupos.get(chave) : undefined;
    if (!chave || !g || g.membros.length < 2) {
      saida.push(c);
      return;
    }
    if (feitos.has(chave)) return;
    feitos.add(chave);
    const siglas = Array.from(new Set(g.membros.map((m) => String(m.partido || '').trim().toUpperCase()).filter(Boolean)));
    const numeros = Array.from(new Set(g.membros.map((m) => String(m.numero || '').trim()).filter(Boolean)));
    const porSecao = new Map<string, SecaoVotoCandidato>();
    g.membros.forEach((m) => {
      (votos[m.id] || []).forEach((r) => {
        const k = `${r.zona}_${r.secao}`;
        const ja = porSecao.get(k);
        if (ja) porSecao.set(k, { ...ja, votos: (ja.votos || 0) + (r.votos || 0), aptos: Math.max(ja.aptos || 0, r.aptos || 0) || undefined });
        else porSecao.set(k, { zona: r.zona, secao: r.secao, local_votacao_num: r.local_votacao_num, votos: r.votos || 0, aptos: r.aptos });
      });
    });
    saida.push({
      id: chave,
      ano: c.ano,
      cargo: c.cargo,
      tipo: c.tipo,
      partido: siglas.join(' + '),
      numero: numeros.join('+'),
      nome: `${c.tipo === 'legenda' ? 'Legenda ' : ''}${nomeCurtoDaFederacao(g.fed)} (${siglas.join(' + ')})`,
      arquivo: '',
      totalVotos: g.membros.reduce((s, m) => s + (m.totalVotos || 0), 0),
      cor: c.cor
    });
    votosDaVisao[chave] = Array.from(porSecao.values());
    if (g.membros.every((m) => excluidosDaSoma.has(m.id))) excluidos.add(chave);
  });
  return { itens: saida, votos: votosDaVisao, excluidos };
}
