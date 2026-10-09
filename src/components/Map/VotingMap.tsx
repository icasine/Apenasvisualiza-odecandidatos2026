import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CandidatoInfo, LocalAgrupado, ModoVisualizacao } from '../../types/election';
import { Crosshair, Maximize2, Upload, AlertCircle, Expand, Shrink, Layers } from 'lucide-react';
import { chaveDaPessoa, pessoaDoItem } from '../../utils/itens';
import { podeInserirArea } from '../../utils/acesso';
import { getStoredGitHubBranch, getStoredGitHubRepo, getStoredGitHubToken } from '../../utils/adminAuth';
import { Censo, lerCenso, censoDaArea, pop16Mais, INDICADORES_CENSO, formatarIndicador, pontoNaArea, calcularComplementaridade, medirApoio, gravarApoio, lerApoios, ApoioPolitico, LIMITE_FORTE, LIMITE_FRACO, AcaoMapa, ObraSocial, Lideranca, lerAcoes, lerObras, lerLiderancas, lerAreas, centroDaArea, chavePerfil, escalaCores, FaixaEscala, lerEscala, Demanda, lerRelacoes, relacaoEntre, RelacaoPolitica, TIPOS_RELACAO, lerDemandas, lerPartidos, lerPerfis, PerfilCandidato, PosicaoPartido, TEMAS } from '../../utils/perfis';

interface VotingMapProps {
  locais: LocalAgrupado[];
  selectedLocalKey: string | null;
  onSelectLocal: (localKey: string) => void;
  candidatosSelecionados: CandidatoInfo[];
  modoVisualizacao: ModoVisualizacao;
  destaqueSecao?: string;
  onAbrirGestao?: () => void;
  hasAnyPublishedData: boolean;
  camadasExtras?: string[];
}

const esc = (valor: unknown): string =>
  String(valor ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const corSegura = (cor: unknown): string =>
  typeof cor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(cor) ? cor : '#2563eb';

const COR_CRESCEU = '#2a78d6';
const COR_CAIU = '#eb6834';
const COR_NEUTRA = '#94a3b8';
const ZOOM_DOS_NUMEROS = 14;
const gruposApoio = (sel: CandidatoInfo[], apoiadoId: string) => {
  if (sel.length < 2) return null;
  const apoiado = sel.find((c) => c.id === apoiadoId) || sel[sel.length - 1];
  const mesmos = sel.filter((c) => c.id !== apoiado.id && chaveDaPessoa(c) === chaveDaPessoa(apoiado));
  const antes = mesmos.filter((c) => String(c.ano) < String(apoiado.ano)).sort((a, b) => String(b.ano).localeCompare(String(a.ano)))[0] || null;
  const apoiadores = sel.filter((c) => c.id !== apoiado.id && !mesmos.includes(c));
  if (!apoiadores.length) return null;
  return { apoiado, apoiadores, antes };
};
const comSinal = (n: number): string => `${n > 0 ? '+' : ''}${n.toLocaleString('pt-BR')}`;

export const VotingMap: React.FC<VotingMapProps> = ({
  locais,
  selectedLocalKey,
  onSelectLocal,
  candidatosSelecionados,
  modoVisualizacao,
  destaqueSecao,
  onAbrirGestao,
  hasAnyPublishedData,
  camadasExtras
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const [isMapReady, setIsMapReady] = useState<boolean>(false);
  const [zoomAtual, setZoomAtual] = useState<number>(12);
  const [legendaAberta, setLegendaAberta] = useState(() => typeof window === 'undefined' || window.innerWidth >= 768);
  const [telaCheia, setTelaCheia] = useState(false);
  useEffect(() => {
    const aoMudar = () => setTelaCheia(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', aoMudar);
    return () => document.removeEventListener('fullscreenchange', aoMudar);
  }, []);
  const [camada, setCamada] = useState<'escolas' | 'calor' | 'bairros' | 'regionais' | 'posicao' | 'demandas' | 'apoio' | 'censo' | 'complementar'>('escolas');
  const [resumoComp, setResumoComp] = useState<{ itens: Array<[string, string, number]>; sobreposicao: number | null; disputa: string[]; aviso: string } | null>(null);
  const [perfisMapa, setPerfisMapa] = useState<PerfilCandidato[] | null>(null);
  const [partidosMapa, setPartidosMapa] = useState<PosicaoPartido[] | null>(null);
  const [escalaMapa, setEscalaMapa] = useState<FaixaEscala[] | null>(null);
  const [censoMapa, setCensoMapa] = useState<Censo | null | false>(null);
  const [indicadorCenso, setIndicadorCenso] = useState('mulheres');
  const [nivelCenso, setNivelCenso] = useState<'bairro' | 'regional'>('bairro');
  const [legendaCenso, setLegendaCenso] = useState<Array<[string, string]>>([]);
  const [demandasMapa, setDemandasMapa] = useState<Demanda[] | null>(null);
  const [categoriaDemanda, setCategoriaDemanda] = useState('');
  const [apoiadoId, setApoiadoId] = useState('');
  const [taxaApoio, setTaxaApoio] = useState(30);
  const [apoiosMapa, setApoiosMapa] = useState<ApoioPolitico[] | null>(null);
  const [acoesDemanda, setAcoesDemanda] = useState<AcaoMapa[] | null>(null);
  useEffect(() => { if (camada === 'demandas' && !acoesDemanda) lerAcoes().then(setAcoesDemanda).catch(() => setAcoesDemanda([])); }, [camada, acoesDemanda]);
  const [salvandoApoio, setSalvandoApoio] = useState(false);
  useEffect(() => { if (camada === 'apoio' && !apoiosMapa) lerApoios().then(setApoiosMapa).catch(() => setApoiosMapa([])); }, [camada, apoiosMapa]);
  const [relacoesMapa, setRelacoesMapa] = useState<RelacaoPolitica[] | null>(null);
  useEffect(() => { if (camada === 'apoio' && !relacoesMapa) lerRelacoes().then(setRelacoesMapa).catch(() => setRelacoesMapa([])); }, [camada, relacoesMapa]);
  useEffect(() => {
    if (camada === 'posicao' || camada === 'demandas') {
      if (!perfisMapa) lerPerfis().then((a) => setPerfisMapa(a.perfis)).catch(() => setPerfisMapa([]));
    }
    if (camada === 'posicao' && !partidosMapa) lerPartidos().then(setPartidosMapa).catch(() => setPartidosMapa([]));
    if (camada === 'posicao' && !escalaMapa) lerEscala().then(setEscalaMapa).catch(() => setEscalaMapa([]));
    if (camada === 'censo' && !censoMapa) lerCenso().then((c) => setCensoMapa(c || false)).catch(() => setCensoMapa(false));
    if (camada === 'demandas' && !demandasMapa) lerDemandas().then(setDemandasMapa).catch(() => setDemandasMapa([]));
  }, [camada, perfisMapa, partidosMapa, demandasMapa, escalaMapa]);
  const [limites, setLimites] = useState<any[] | null>(null);
  useEffect(() => {
    if ((camada !== 'bairros' && camada !== 'regionais' && camada !== 'posicao' && camada !== 'demandas' && camada !== 'censo' && camada !== 'complementar') || limites) return;
    // @ts-ignore
    import('../../geo/contagem-bairros.json')
      .then((mod: any) => { const gj = mod?.default || mod; setLimites(Array.isArray(gj?.features) ? gj.features : []); })
      .catch(() => setLimites([]));
  }, [camada, limites]);
  const hasFittedBounds = useRef<boolean>(false);
  const onSelectLocalRef = useRef(onSelectLocal);
  onSelectLocalRef.current = onSelectLocal;

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }
    if ((container as any)._leaflet_id) {
      delete (container as any)._leaflet_id;
    }
    container.innerHTML = '';

    const map = L.map(container, {
      center: [-19.9385, -44.0495],
      zoom: 12,
      minZoom: 10,
      maxZoom: 19,
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    markersLayerRef.current = layerGroup;
    mapInstanceRef.current = map;
    setIsMapReady(true);
    map.on('zoomend', () => setZoomAtual(map.getZoom()));

    const timers = [
      setTimeout(() => map.invalidateSize(), 50),
      setTimeout(() => map.invalidateSize(), 150),
      setTimeout(() => map.invalidateSize(), 400),
      setTimeout(() => map.invalidateSize(), 800)
    ];

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        map.invalidateSize();
      });
      ro.observe(container);
    }

    const handleResize = () => map.invalidateSize();
    window.addEventListener('resize', handleResize);

    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('resize', handleResize);
      if (ro) ro.disconnect();
      map.off();
      map.stop();
      (map as any)._animatingZoom = false;
      map.remove();
      mapInstanceRef.current = null;
      setIsMapReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer || !isMapReady) return;

    layer.clearLayers();

    const validLocais = locais.filter((l) => l.latitude !== null && l.longitude !== null);

    if (!hasFittedBounds.current && validLocais.length > 0 && !selectedLocalKey && !destaqueSecao) {
      const bounds = L.latLngBounds(validLocais.map((l) => [l.latitude!, l.longitude!] as [number, number]));
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [35, 35], maxZoom: 13 });
        hasFittedBounds.current = true;
      }
    }

    if (camada === 'calor') {
      const maxCalor = Math.max(...validLocais.map((l) => l.totalVotosMarcados), 1);
      validLocais.filter((l) => l.totalVotosMarcados > 0).forEach((l) => {
        const intensidade = l.totalVotosMarcados / maxCalor;
        const cor = intensidade > 0.66 ? '#dc2626' : intensidade > 0.33 ? '#f97316' : '#facc15';
        layer.addLayer(L.circle([l.latitude!, l.longitude!], { radius: 250 + 900 * Math.sqrt(intensidade), stroke: false, fillColor: cor, fillOpacity: 0.18 + 0.32 * intensidade, interactive: false }));
      });
      return;
    }
    const escolasDosBairros = () => {
      const areas = (limites || []).filter((f: any) => f?.properties?.nivel === 'bairro');
      const dentroDe = (lng: number, lat: number, geom: any) => {
        const polis = geom?.type === 'Polygon' ? [geom.coordinates] : geom?.coordinates || [];
        return polis.some((poli: number[][][]) => {
          const anel = poli[0] || [];
          let c = false;
          for (let a = 0, b = anel.length - 1; a < anel.length; b = a++) {
            const [xa, ya] = anel[a], [xb, yb] = anel[b];
            if ((ya > lat) !== (yb > lat) && lng < ((xb - xa) * (lat - ya)) / (yb - ya) + xa) c = !c;
          }
          return c;
        });
      };
      return areas.map((f: any) => {
        let escolas = validLocais.filter((l) => dentroDe(l.longitude!, l.latitude!, f.geometry));
        let proxima: string | null = null;
        if (escolas.length === 0 && validLocais.length > 0) {
          const anel = f.geometry?.coordinates?.[0]?.[0] || [];
          const cx = anel.reduce((s: number, p: number[]) => s + p[0], 0) / (anel.length || 1);
          const cy = anel.reduce((s: number, p: number[]) => s + p[1], 0) / (anel.length || 1);
          const perto = validLocais.reduce((m, l) => (Math.hypot(l.latitude! - cy, l.longitude! - cx) < Math.hypot(m.latitude! - cy, m.longitude! - cx) ? l : m));
          escolas = [perto];
          proxima = perto.nome_local;
        }
        return { f, nome: String(f.properties?.nome || ''), escolas, proxima };
      });
    };

    if (camada === 'posicao') {
      if (!limites || !perfisMapa || !partidosMapa) return;
      const posDe = (c: CandidatoInfo): number | null => {
        const p = perfisMapa.find((x) => !x.teste && chavePerfil(x.pessoa) === chaveDaPessoa(c));
        if (p?.posicao != null) return p.posicao;
        const sigla = String(c.partido || '').toUpperCase();
        return partidosMapa.find((x) => x.sigla === sigla)?.posicao ?? null;
      };
      const comPos = candidatosSelecionados.map((c) => ({ c, pos: posDe(c) })).filter((x) => x.pos !== null) as Array<{ c: CandidatoInfo; pos: number }>;
      const cores = escalaCores(escalaMapa);
      const corDe = (v: number) => {
        const k = Math.max(0, Math.min(3.999, v / 2.5));
        const a = Math.floor(k), t2 = k - a;
        const h = (s: string) => [1, 3, 5].map((n) => parseInt(s.slice(n, n + 2), 16));
        const [r1, g1, b1] = h(cores[a]), [r2, g2, b2] = h(cores[a + 1]);
        return `rgb(${Math.round(r1 + (r2 - r1) * t2)},${Math.round(g1 + (g2 - g1) * t2)},${Math.round(b1 + (b2 - b1) * t2)})`;
      };
      escolasDosBairros().forEach(({ f, nome, escolas, proxima }) => {
        let soma = 0, peso = 0;
        escolas.forEach((l) => comPos.forEach(({ c, pos }) => { const v = l.votosPorCandidato[c.id] || 0; soma += v * pos; peso += v; }));
        const media = peso > 0 ? soma / peso : null;
        const pol = L.geoJSON(f, { style: { color: '#334155', weight: 1, fillColor: media != null ? corDe(media) : '#f1f5f9', fillOpacity: media != null ? 0.7 : 0.2, dashArray: proxima ? '3 3' : undefined } });
        pol.bindTooltip(`<strong>${esc(nome)}</strong><br>${media != null ? 'Posição média: ' + media.toFixed(1).replace('.', ',') + ' (0 extrema direita, 5 centro, 10 extrema esquerda)' : 'Sem votos com posição'}<br>${peso.toLocaleString('pt-BR')} votos considerados${proxima ? '<br><em>Sem local de votação; usa a escola mais próxima: ' + esc(proxima) + '</em>' : ''}`, { sticky: true });
        layer.addLayer(pol);
      });
      return;
    }

    if (camada === 'censo') {
      if (!limites || !censoMapa) return;
      const usarVotos = indicadorCenso === 'votos' && candidatosSelecionados.length > 0;
      const ind = INDICADORES_CENSO.find((x) => x.id === indicadorCenso) || INDICADORES_CENSO[3];
      const areas = limites.filter((f: any) => (f?.properties?.nivel === 'regional') === (nivelCenso === 'regional'));
      const votosDaArea = (f: any) => {
        const escolas = validLocais.filter((l) => pontoNaArea(l.longitude!, l.latitude!, f.geometry));
        if (!escolas.length) return null;
        return escolas.reduce((s, l) => s + candidatosSelecionados.reduce((t, c) => t + (l.votosPorCandidato[c.id] || 0), 0), 0);
      };
      const linhas = areas.map((f: any) => {
        const nome = String(f.properties.nome);
        const dado = censoDaArea(censoMapa, nome, nivelCenso);
        let valor: number | null = null;
        let extra = '';
        if (dado) {
          if (usarVotos) {
            const votos = votosDaArea(f);
            const p16 = pop16Mais(dado.u);
            valor = votos !== null && p16 > 0 ? (votos * 1000) / p16 : null;
            extra = votos !== null ? `<br>${votos.toLocaleString('pt-BR')} votos dos marcados · ${Math.round(p16).toLocaleString('pt-BR')} pessoas de 16+` : '<br>Sem local de votação dentro desta área';
          } else valor = ind.valor(dado.u);
        }
        return { f, nome, dado, valor, extra };
      });
      const valores = linhas.map((l) => l.valor).filter((x): x is number => x !== null && Number.isFinite(x)).sort((a, b) => a - b);
      const cores = ['#eff6ff', '#bfdbfe', '#60a5fa', '#2563eb', '#1e3a8a'];
      const cortes = [0.2, 0.4, 0.6, 0.8].map((q) => valores[Math.min(valores.length - 1, Math.floor(q * valores.length))]);
      const classe = (x: number) => cortes.filter((c) => x > c).length;
      const fmtV = (x: number | null) => (usarVotos ? (x === null ? '-' : x.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' votos por mil') : formatarIndicador(x, ind.formato));
      linhas.forEach(({ f, nome, dado, valor, extra }) => {
        const tem = valor !== null && Number.isFinite(valor);
        const pol = L.geoJSON(f, { style: { color: '#334155', weight: nivelCenso === 'regional' ? 2 : 1, fillColor: tem ? cores[classe(valor as number)] : '#f1f5f9', fillOpacity: tem ? 0.75 : 0.25 } });
        const origem = dado && nivelCenso === 'bairro' && !(dado.origem.length === 1 && chavePerfil(dado.origem[0]) === chavePerfil(nome)) ? `<br><span style="color:#64748b">Dados do censo de: ${esc(dado.origem.join(', '))}</span>` : '';
        pol.bindTooltip(`<strong>${esc(nome)}</strong><br>${dado ? esc(usarVotos ? 'Votos por mil pessoas de 16+' : ind.nome) + ': <b>' + fmtV(valor) + '</b>' + extra + '<br>População: ' + Math.round(dado.u.pop).toLocaleString('pt-BR') : 'Sem dado do censo para esta área'}${origem}`, { sticky: true });
        layer.addLayer(pol);
      });
      const leg: Array<[string, string]> = valores.length ? cores.map((c, i) => [c, i === 0 ? 'até ' + fmtV(cortes[0]) : i === 4 ? 'acima de ' + fmtV(cortes[3]) : fmtV(cortes[i - 1]) + ' a ' + fmtV(cortes[i])] as [string, string]) : [];
      setLegendaCenso(leg);
      return;
    }

    if (camada === 'complementar') {
      if (!limites) return;
      const ids = candidatosSelecionados.slice(0, 4).map((c) => c.id);
      if (ids.length < 2) {
        setResumoComp({ itens: [], sobreposicao: null, disputa: [], aviso: 'Marque de 2 a 4 candidatos no filtro para ver onde se completam e onde disputam o mesmo eleitorado.' });
        return;
      }
      const nomeDe = (id: string) => candidatosSelecionados.find((c) => c.id === id)?.nome || id;
      const paleta = ['#2563eb', '#dc2626', '#16a34a', '#d97706'];
      const corDoId = (id: string) => paleta[ids.indexOf(id)] || '#64748b';
      const areas = limites.filter((f: any) => (f?.properties?.nivel === 'regional') === (nivelCenso === 'regional'));
      const entrada = areas.map((f: any) => ({
        nome: String(f.properties.nome),
        locais: validLocais.filter((l) => pontoNaArea(l.longitude!, l.latitude!, f.geometry)).map((l) => ({ aptos: l.totalEleitoresAptos || 0, votos: l.votosPorCandidato }))
      }));
      const res = calcularComplementaridade(entrada, ids);
      const fmtI = (v: number | null) => (v === null ? '-' : v.toLocaleString('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 2 }));
      const textoClasse = (a: (typeof res.areas)[number]) =>
        a.classe === 'sem' ? 'Sem local de votação nesta área'
          : a.classe === 'varios' ? 'Disputa: ' + a.fortes.map(nomeDe).join(' e ') + ' são fortes aqui'
          : a.classe === 'um' ? 'Só ' + nomeDe(a.fortes[0]) + ' é forte aqui'
          : a.classe === 'nenhum' ? 'Nenhum é forte: área a conquistar'
          : 'Votação perto da média para todos';
      res.areas.forEach((a, i) => {
        const f = areas[i];
        const cor = a.classe === 'varios' ? '#7c3aed' : a.classe === 'um' ? corDoId(a.fortes[0]) : a.classe === 'nenhum' ? '#fde68a' : a.classe === 'misto' ? '#cbd5e1' : '#f8fafc';
        const pol = L.geoJSON(f, { style: { color: '#334155', weight: nivelCenso === 'regional' ? 2 : 1, fillColor: cor, fillOpacity: a.classe === 'sem' ? 0.15 : 0.6, dashArray: a.classe === 'sem' ? '3 3' : undefined } });
        const linhas = ids.map((id) => '<span style="color:' + corDoId(id) + '">●</span> ' + esc(nomeDe(id)) + ': ' + a.votos[id].toLocaleString('pt-BR') + ' votos · ' + (a.parte[id] * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '% do total dele · índice ' + fmtI(a.indice[id])).join('<br>');
        pol.bindTooltip('<strong>' + esc(a.nome) + '</strong><br><em>' + esc(textoClasse(a)) + '</em><br>' + linhas + '<br>' + a.aptos.toLocaleString('pt-BR') + ' eleitores aptos nos locais desta área', { sticky: true });
        layer.addLayer(pol);
      });
      const conta = (fn: (a: (typeof res.areas)[number]) => boolean) => res.areas.filter(fn).length;
      const itens: Array<[string, string, number]> = [
        ...ids.map((id) => [corDoId(id), 'Só ' + nomeDe(id) + ' forte', conta((a) => a.classe === 'um' && a.fortes[0] === id)] as [string, string, number]),
        ['#7c3aed', 'Dois ou mais fortes (disputa)', conta((a) => a.classe === 'varios')],
        ['#cbd5e1', 'Perto da média', conta((a) => a.classe === 'misto')],
        ['#fde68a', 'Nenhum forte (a conquistar)', conta((a) => a.classe === 'nenhum')],
        ['#f8fafc', 'Sem local de votação', conta((a) => a.classe === 'sem')]
      ];
      const disputa = res.areas.filter((a) => a.classe === 'varios').sort((x, y) => ids.reduce((s, id) => s + x.votos[id], 0) < ids.reduce((s, id) => s + y.votos[id], 0) ? 1 : -1).slice(0, 6).map((a) => a.nome);
      setResumoComp({ itens, sobreposicao: res.sobreposicao, disputa, aviso: '' });
      return;
    }

    if (camada === 'demandas') {
      if (!limites || !demandasMapa) return;
      const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      const abertas = demandasMapa.filter((d) => (!categoriaDemanda || d.categoria === categoriaDemanda));
      const autores = candidatosSelecionados.map((c) => chaveDaPessoa(c));
      const acoesUsadas = (acoesDemanda || []).filter((a) => a.lat != null && a.lng != null && (!categoriaDemanda || a.tema === categoriaDemanda || (a.temas || []).includes(categoriaDemanda)) && (!autores.length || a.politicos.some((p) => autores.includes(chavePerfil(p)))));
      const lista = escolasDosBairros().map((a) => {
        const daArea = abertas.filter((d) => d.nivel === 'bairro' && norm(d.area) === norm(a.nome));
        const acoesArea = acoesUsadas.filter((x) => (x.aproximado && x.bairro ? norm(x.bairro) === norm(a.nome) : pontoNaArea(x.lng!, x.lat!, a.f.geometry)));
        return { ...a, daArea, acoesArea, pontos: daArea.reduce((s, d) => s + d.gravidade, 0) + acoesArea.length };
      });
      const maxP = Math.max(1, ...lista.map((x) => x.pontos));
      const temaDe = (c: CandidatoInfo) => (perfisMapa || []).find((x) => !x.teste && chavePerfil(x.pessoa) === chaveDaPessoa(c))?.temas || [];
      lista.forEach(({ f, nome, escolas, daArea, acoesArea, pontos }) => {
        const t = pontos / maxP;
        const cor = pontos === 0 ? '#f1f5f9' : t > 0.66 ? '#b91c1c' : t > 0.33 ? '#f97316' : '#fde68a';
        const pol = L.geoJSON(f, { style: { color: '#334155', weight: 1, fillColor: cor, fillOpacity: pontos ? 0.7 : 0.25 } });
        const porCat: Record<string, number> = {};
        daArea.forEach((d) => { porCat[d.categoria] = (porCat[d.categoria] || 0) + 1; });
        const porTema: Record<string, number> = {};
        acoesArea.forEach((x) => { const tm = x.tema || 'Sem tema'; porTema[tm] = (porTema[tm] || 0) + 1; });
        const lista2 = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([kk, n]) => esc(kk) + ' (' + n + ')').join(', ');
        const cruz = candidatosSelecionados.map((c) => {
          const votos = escolas.reduce((s, l) => s + (l.votosPorCandidato[c.id] || 0), 0);
          const pedidos = acoesArea.filter((x) => x.politicos.some((p) => chavePerfil(p) === chaveDaPessoa(c))).length;
          const temas = temaDe(c).filter((x) => porCat[x] || porTema[x]);
          return esc(c.nome) + ': ' + votos.toLocaleString('pt-BR') + ' votos · ' + pedidos + (pedidos === 1 ? ' pedido' : ' pedidos') + (temas.length ? ' · tem o tema ' + esc(temas.join(', ')) : '');
        });
        const linhas = [] as string[];
        if (acoesArea.length) linhas.push(acoesArea.length + (autores.length ? ' pedidos dos marcados: ' : ' pedidos registrados: ') + lista2(porTema));
        if (daArea.length) linhas.push(daArea.length + ' demandas anotadas: ' + lista2(porCat));
        pol.bindTooltip('<strong>' + esc(nome) + '</strong><br>' + (linhas.length ? linhas.join('<br>') : 'Nenhum pedido ou demanda') + (cruz.length ? '<br>' + cruz.join('<br>') : ''), { sticky: true });
        layer.addLayer(pol);
      });
      return;
    }


    if (camada === 'apoio') {
      const grupos = gruposApoio(candidatosSelecionados, apoiadoId);
      if (!grupos) return;
      const { apoiado, apoiadores } = grupos;
      const somaA = (l: LocalAgrupado) => apoiadores.reduce((s, c) => s + (l.votosPorCandidato[c.id] || 0), 0);
      const maxA = Math.max(1, ...validLocais.map(somaA));
      validLocais.forEach((l) => {
        const a = somaA(l);
        const b = l.votosPorCandidato[apoiado.id] || 0;
        if (a <= 0) return;
        const ganho = Math.round((a * taxaApoio) / 100);
        const parteA = a / (a + b || 1);
        const cor = parteA > 0.66 ? '#15803d' : parteA > 0.33 ? '#4ade80' : '#bbf7d0';
        const mk = L.circleMarker([l.latitude!, l.longitude!], { radius: 5 + 20 * Math.sqrt(a / maxA), color: '#14532d', weight: 1, fillColor: cor, fillOpacity: 0.75 });
        mk.bindTooltip('<strong>' + esc(l.nome_local) + '</strong><br>' + apoiadores.map((c) => esc(c.nome) + ' (' + c.ano + '): ' + (l.votosPorCandidato[c.id] || 0).toLocaleString('pt-BR')).join('<br>') + '<br>Apoiado, ' + esc(apoiado.nome) + ' (' + apoiado.ano + '): ' + b.toLocaleString('pt-BR') + '<br>Simulação com ' + taxaApoio + String.fromCharCode(37) + ' de transferência: +' + ganho.toLocaleString('pt-BR'));
        mk.on('click', () => onSelectLocalRef.current(l.key));
        layer.addLayer(mk);
      });
      return;
    }


    if (camada === 'bairros' || camada === 'regionais') {
      if (!limites) return;
      const nivel = camada === 'bairros' ? 'bairro' : 'regional';
      const areas = limites.filter((f: any) => f?.properties?.nivel === nivel);
      const dentro = (lng: number, lat: number, geom: any) => {
        const polis = geom?.type === 'Polygon' ? [geom.coordinates] : geom?.coordinates || [];
        return polis.some((poli: number[][][]) => {
          const anel = poli[0] || [];
          let c = false;
          for (let a = 0, b = anel.length - 1; a < anel.length; b = a++) {
            const [xa, ya] = anel[a], [xb, yb] = anel[b];
            if ((ya > lat) !== (yb > lat) && lng < ((xb - xa) * (lat - ya)) / (yb - ya) + xa) c = !c;
          }
          return c;
        });
      };
      const centro = (geom: any): [number, number] => {
        const anel = (geom?.coordinates?.[0]?.[0]) || [];
        let sx = 0, sy = 0;
        anel.forEach(([x, y]: number[]) => { sx += x; sy += y; });
        return anel.length ? [sy / anel.length, sx / anel.length] : [0, 0];
      };
      const dados = areas.map((f: any) => {
        const escolas = validLocais.filter((l) => dentro(l.longitude!, l.latitude!, f.geometry));
        let fonte = escolas;
        let proxima: string | null = null;
        if (escolas.length === 0 && nivel === 'bairro' && validLocais.length > 0) {
          const [cy, cx] = centro(f.geometry);
          const perto = validLocais.reduce((m, l) => (Math.hypot(l.latitude! - cy, l.longitude! - cx) < Math.hypot(m.latitude! - cy, m.longitude! - cx) ? l : m));
          fonte = [perto];
          proxima = perto.nome_local;
        }
        const votos = fonte.reduce((s, l) => s + l.totalVotosMarcados, 0);
        const eleitores = fonte.reduce((s, l) => s + l.totalEleitoresAptos, 0);
        return { f, escolas, proxima, votos, eleitores, pct: eleitores > 0 ? votos / eleitores : 0 };
      });
      const comVotos = candidatosSelecionados.length > 0;
      const pcts = dados.map((d) => d.pct).filter((p) => p > 0).sort((a, b) => a - b);
      const corte = (q: number) => pcts.length ? pcts[Math.min(pcts.length - 1, Math.floor(q * pcts.length))] : 0;
      const faixas = [corte(0.2), corte(0.4), corte(0.6), corte(0.8)];
      const cores = ['#eff6ff', '#bfdbfe', '#60a5fa', '#2563eb', '#1e3a8a'];
      dados.forEach((d) => {
        const classe = d.pct <= 0 ? -1 : faixas.filter((c) => d.pct > c).length;
        const pol = L.geoJSON(d.f, {
          style: {
            color: '#334155',
            weight: 1,
            fillColor: comVotos && classe >= 0 ? cores[classe] : '#e2e8f0',
            fillOpacity: comVotos ? (d.proxima ? 0.45 : 0.7) : 0.25,
            dashArray: d.proxima ? '3 3' : undefined
          }
        });
        const pctTxt = (d.pct * 100).toFixed(2).replace('.', ',') + '%';
        const origem = d.proxima
          ? `<br><em>Sem local de votação; usa a escola mais próxima: ${esc(d.proxima)}</em>`
          : `<br>${d.escolas.length} ${d.escolas.length === 1 ? 'escola' : 'escolas'}`;
        pol.bindTooltip(`<strong>${esc(d.f.properties?.nome || '')}</strong>${comVotos ? `<br>${d.votos.toLocaleString('pt-BR')} votos (${pctTxt} dos eleitores)` : ''}<br>${d.eleitores.toLocaleString('pt-BR')} eleitores${origem}`, { sticky: true });
        layer.addLayer(pol);
      });
      return;
    }

    const maxVotos = Math.max(...validLocais.map((l) => l.totalVotosMarcados), 1);
    const modoDiferenca = modoVisualizacao === 'diferenca';
    const maxDiferenca = Math.max(...validLocais.map((l) => Math.abs(l.comparacao?.diferencaVotos ?? 0)), 1);
    const nomeDoItem = (id: string | undefined): string => {
      const c = candidatosSelecionados.find((x) => x.id === id);
      return c ? `${c.nome} ${c.ano}` : '';
    };
    const mostrarNumeros = map.getZoom() >= ZOOM_DOS_NUMEROS;

    validLocais.forEach((loc) => {
      const isSelected = selectedLocalKey === loc.key;
      const isHighlightedSecao =
        destaqueSecao && loc.secoes.some((s) => s.secao === destaqueSecao.padStart(4, '0'));

      const diferenca = loc.comparacao ? loc.comparacao.diferencaVotos : null;
      const semItens = candidatosSelecionados.length > 0 && (loc.semCorrespondencia?.length || 0) === candidatosSelecionados.length;
      const radius = modoDiferenca
        ? diferenca === null
          ? 6
          : Math.min(26, Math.max(6, 6 + Math.sqrt(Math.abs(diferenca) / maxDiferenca) * 18))
        : Math.min(26, Math.max(7, 8 + Math.sqrt(loc.totalVotosMarcados / maxVotos) * 16));

      let marker: L.Layer;

      if (modoDiferenca) {
        const semPar = diferenca === null;
        marker = L.circleMarker([loc.latitude!, loc.longitude!], {
          radius: isSelected || isHighlightedSecao ? radius + 5 : radius,
          fillColor: semPar ? '#ffffff' : diferenca! > 0 ? COR_CRESCEU : diferenca! < 0 ? COR_CAIU : COR_NEUTRA,
          color: isSelected ? '#0f172a' : isHighlightedSecao ? '#f59e0b' : semPar ? '#64748b' : '#ffffff',
          weight: isSelected || isHighlightedSecao ? 3 : semPar ? 2 : 1.5,
          dashArray: semPar && !isSelected ? '3 3' : undefined,
          opacity: 0.95,
          fillOpacity: semPar ? 0.7 : 0.88
        });
      } else if (modoVisualizacao === 'lado_a_lado' && candidatosSelecionados.length > 1 && loc.totalVotosMarcados > 0) {
        const size = (isSelected || isHighlightedSecao ? radius + 5 : radius) * 2;
        const center = size / 2;
        const rInner = Math.max(3, center * 0.45);
        const rOuter = center - 2;

        let accumulatedAngle = 0;
        let svgPaths = '';

        candidatosSelecionados.forEach((cand) => {
          const votosCand = loc.votosPorCandidato[cand.id] || 0;
          if (votosCand <= 0) return;

          const sliceAngle = (votosCand / loc.totalVotosMarcados) * 2 * Math.PI;
          const startAngle = accumulatedAngle;
          const endAngle = accumulatedAngle + sliceAngle;
          accumulatedAngle = endAngle;

          const x1 = center + rOuter * Math.cos(startAngle);
          const y1 = center + rOuter * Math.sin(startAngle);
          const x2 = center + rOuter * Math.cos(endAngle);
          const y2 = center + rOuter * Math.sin(endAngle);

          const x3 = center + rInner * Math.cos(endAngle);
          const y3 = center + rInner * Math.sin(endAngle);
          const x4 = center + rInner * Math.cos(startAngle);
          const y4 = center + rInner * Math.sin(startAngle);

          const largeArc = sliceAngle > Math.PI ? 1 : 0;

          const pathD = `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4} ${y4} Z`;
          svgPaths += `<path d="${pathD}" fill="${corSegura(cand.cor)}" stroke="#ffffff" stroke-width="0.8" opacity="0.95" />`;
        });

        const iconHtml = `
          <div style="width: ${size}px; height: ${size}px; cursor: pointer; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.35));">
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
              <circle cx="${center}" cy="${center}" r="${center - 1}" fill="rgba(255, 255, 255, 0.95)" stroke="${isSelected ? '#0f172a' : '#475569'}" stroke-width="${isSelected ? '2.5' : '1.5'}" />
              ${svgPaths}
              <circle cx="${center}" cy="${center}" r="${rInner}" fill="#ffffff" />
            </svg>
          </div>
        `;

        const divIcon = L.divIcon({
          className: 'custom-pie-marker',
          html: iconHtml,
          iconSize: [size, size],
          iconAnchor: [center, center]
        });

        marker = L.marker([loc.latitude!, loc.longitude!], { icon: divIcon });
      } else {
        const corPrimaria = semItens
          ? '#cbd5e1'
          : candidatosSelecionados.length === 1
          ? corSegura(candidatosSelecionados[0].cor)
          : loc.totalVotosMarcados > 0
          ? '#2563eb' // blue
          : '#64748b'; // slate

        marker = L.circleMarker([loc.latitude!, loc.longitude!], {
          radius: isSelected || isHighlightedSecao ? radius + 5 : radius,
          fillColor: corPrimaria,
          color: isSelected ? '#0f172a' : isHighlightedSecao ? '#f59e0b' : '#ffffff',
          weight: isSelected || isHighlightedSecao ? 3 : 1.5,
          opacity: 0.95,
          fillOpacity: 0.85
        });
      }

      const variosAnos = new Set(candidatosSelecionados.map((c) => c.ano)).size > 1;
      const breakdownHtml = candidatosSelecionados
        .map((cand) => {
          const semCorrespondencia = (loc.semCorrespondencia || []).includes(cand.id);
          const v = loc.votosPorCandidato[cand.id] || 0;
          const eleitores = loc.eleitoresPorAno?.[cand.ano] ?? loc.totalEleitoresAptos;
          const p = eleitores > 0 ? ((v / eleitores) * 100).toFixed(1) : '0';
          const valor = semCorrespondencia ? 'sem correspondência' : `${v.toLocaleString('pt-BR')} (${p}%)`;
          return `
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 2px;">
              <span style="display: flex; align-items: center; gap: 4px; color: #334155; font-size: 11px;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: ${corSegura(cand.cor)};"></span>
                <span>${esc(cand.nome)}${cand.numero ? ` (${esc(cand.numero)})` : ''}${variosAnos ? ` ${esc(cand.ano)}` : ''}:</span>
              </span>
              <span style="font-weight: 700; color: ${semCorrespondencia ? '#64748b' : '#0f172a'}; font-variant-numeric: tabular-nums;">${valor}</span>
            </div>
          `;
        })
        .join('');

      const comparacaoHtml = loc.comparacao
        ? `<div style="margin-top: 4px; padding-top: 3px; border-top: 1px dashed rgba(15,23,42,0.15); font-size: 11px; color: #0f172a;">
            <span style="color: #475569;">De ${esc(nomeDoItem(loc.comparacao.deId))} para ${esc(nomeDoItem(loc.comparacao.paraId))}:</span>
            <strong style="font-variant-numeric: tabular-nums;"> ${
              loc.comparacao.diferencaVotos === null ? 'sem correspondência em um dos anos' : `${comSinal(loc.comparacao.diferencaVotos)} votos`
            }</strong>
          </div>`
        : '';

      const tooltipContent = `
        <div style="font-family: inherit;">
          <div style="font-weight: 700; font-size: 13px; color: #0f172a;">${esc(loc.nome_local)}</div>
          <div style="font-size: 11px; color: #475569; margin-top: 2px;">
            Zona ${esc(loc.zona)} · Local nº ${esc(loc.local_num)} · ${esc(loc.bairro)}
          </div>
          <div style="font-size: 10px; color: #475569; margin-top: 2px;">
            ${loc.secoes.length} seções · ${
              variosAnos && loc.eleitoresPorAno
                ? Object.keys(loc.eleitoresPorAno).sort().map((a) => `${esc(a)}: ${(loc.eleitoresPorAno![a] || 0).toLocaleString('pt-BR')}`).join(' · ') + ' eleitores'
                : `${loc.totalEleitoresAptos.toLocaleString('pt-BR')} eleitores aptos`
            }
          </div>
          <div style="margin-top: 6px; padding-top: 4px; border-top: 1px solid rgba(15,23,42,0.12);">
            ${candidatosSelecionados.length > 0 ? breakdownHtml : '<span style="color: #475569; font-size: 11px;">Nenhum candidato marcado</span>'}
            ${
              candidatosSelecionados.length > 1 && !variosAnos
                ? `<div style="margin-top: 4px; padding-top: 3px; border-top: 1px dashed rgba(15,23,42,0.15); display: flex; justify-content: space-between; font-weight: 700; font-size: 11px; color: #1d4ed8;">
                    <span>Total Marcados:</span>
                    <span>${loc.totalVotosMarcados.toLocaleString('pt-BR')} (${loc.pctSobreEleitores.toFixed(1)}%)</span>
                  </div>`
                : ''
            }
            ${comparacaoHtml}
          </div>
          <div style="margin-top: 4px; font-size: 9px; color: #64748b; text-align: right;">
            Toque para abrir detalhes
          </div>
        </div>
      `;

      marker.bindTooltip(tooltipContent, {
        className: 'custom-leaflet-tooltip',
        direction: 'top',
        offset: [0, -radius]
      });

      marker.on('click', () => {
        onSelectLocalRef.current(loc.key);
      });

      layer.addLayer(marker);

      if (mostrarNumeros && candidatosSelecionados.length > 0) {
        const textoNumero = modoDiferenca
          ? diferenca === null
            ? ''
            : comSinal(diferenca)
          : semItens
          ? ''
          : loc.totalVotosMarcados.toLocaleString('pt-BR');
        if (textoNumero) {
          const rotulo = L.marker([loc.latitude!, loc.longitude!], {
            interactive: false,
            keyboard: false,
            icon: L.divIcon({
              className: 'rotulo-minas',
              html: `<span>${esc(textoNumero)}</span>`,
              iconSize: [0, 0],
              iconAnchor: [0, -(radius + 11)]
            })
          });
          layer.addLayer(rotulo);
        }
      }
    });
  }, [
    locais,
    selectedLocalKey,
    candidatosSelecionados,
    modoVisualizacao,
    destaqueSecao,
    isMapReady,
    camada,
    limites,
    perfisMapa,
    partidosMapa,
    escalaMapa,
    censoMapa,
    indicadorCenso,
    nivelCenso,
    demandasMapa,
    acoesDemanda,
    categoriaDemanda,
    apoiadoId,
    taxaApoio,
    zoomAtual >= ZOOM_DOS_NUMEROS
  ]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (destaqueSecao) {
      const match = locais.find((l) =>
        l.secoes.some((s) => s.secao === destaqueSecao.padStart(4, '0'))
      );
      if (match && match.latitude !== null && match.longitude !== null) {
        map.flyTo([match.latitude, match.longitude], 15, { duration: 1 });
      }
    } else if (selectedLocalKey) {
      const match = locais.find((l) => l.key === selectedLocalKey);
      if (match && match.latitude !== null && match.longitude !== null) {
        map.panTo([match.latitude, match.longitude]);
      }
    }
  }, [selectedLocalKey, destaqueSecao, locais]);

  const resetView = useCallback(() => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([-19.9385, -44.0495], 12);
      mapInstanceRef.current.invalidateSize();
    }
  }, []);

  const fitAllPoints = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const validLocais = locais.filter((l) => l.latitude !== null && l.longitude !== null);
    if (validLocais.length > 0) {
      const bounds = L.latLngBounds(validLocais.map((l) => [l.latitude!, l.longitude!] as [number, number]));
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [35, 35], maxZoom: 14 });
      }
    } else {
      resetView();
    }
  }, [locais, resetView]);

  const [extras, setExtras] = useState<{ liderancas?: Lideranca[]; acoes?: AcaoMapa[]; obras?: ObraSocial[]; areas?: any[]; perfis?: PerfilCandidato[] }>({});
  const extrasRef = useRef<L.LayerGroup | null>(null);
  const [legendaAcoes, setLegendaAcoes] = useState<Array<[string, string]>>([]);
  useEffect(() => {
    const quer = camadasExtras || [];
    if (!quer.length) return;
    let vivo = true;
    (async () => {
      const novo: typeof extras = {};
      if (!extras.areas) novo.areas = await lerAreas().catch(() => []);
      if (quer.includes('liderancas') && !extras.liderancas) novo.liderancas = await lerLiderancas().catch(() => []);
      if (quer.includes('acoes') && !extras.acoes) novo.acoes = await lerAcoes().catch(() => []);
      if (quer.includes('obras') && !extras.obras) novo.obras = await lerObras().catch(() => []);
      if (quer.includes('atuacao') && !extras.perfis) novo.perfis = (await lerPerfis().catch(() => ({ perfis: [] as PerfilCandidato[] }))).perfis;
      if (vivo && Object.keys(novo).length) setExtras((e) => ({ ...e, ...novo }));
    })();
    return () => { vivo = false; };
  }, [camadasExtras]);
  useEffect(() => {
    const mapa = mapInstanceRef.current;
    if (!mapa) return;
    if (!mapa.getPane('extras')) { const p = mapa.createPane('extras'); p.style.zIndex = '450'; }
    if (!extrasRef.current) extrasRef.current = L.layerGroup();
    const g = extrasRef.current;
    if (!mapa.hasLayer(g)) g.addTo(mapa);
    g.clearLayers();
    const quer = camadasExtras || [];
    if (!quer.length) return;
    const areas = extras.areas || [];
    const rend = L.canvas({ pane: 'extras' });
    const corTema = (t?: string) => { const i = TEMAS.indexOf(t || ''); return i >= 0 ? `hsl(${Math.round((i * 360) / TEMAS.length)}, 65%, 42%)` : '#64748b'; };
    const lugar = (lat?: number, lng?: number, bairros: string[] = []): [number, number] | null => (lat != null && lng != null ? [lat, lng] : bairros.length ? centroDaArea(areas, bairros[0]) : null);
    if (quer.includes('atuacao') && extras.perfis) {
      const nomes = new Set<string>();
      candidatosSelecionados.forEach((c) => {
        const p = extras.perfis!.find((x) => chavePerfil(x.pessoa) === chaveDaPessoa(c));
        (p?.bairrosAtuacao || []).forEach((b) => nomes.add(chavePerfil(b)));
      });
      areas.filter((f) => nomes.has(chavePerfil(f?.properties?.nome))).forEach((f) => {
        g.addLayer(L.geoJSON(f as any, { pane: 'extras', interactive: false, style: { color: '#7c3aed', weight: 2.5, dashArray: '6 4', fillColor: '#a78bfa', fillOpacity: 0.12 } } as any));
      });
    }
    if (quer.includes('acoes')) {
      const nomesSel = Array.from(new Set(candidatosSelecionados.map((c) => pessoaDoItem(c)))).slice(0, 2);
      const coresSel = ['#2563eb', '#dc2626'];
      const contagem = [0, 0];
      (extras.acoes || []).forEach((a) => {
        if (a.lat == null || a.lng == null) return;
        let cor = corTema(a.tema);
        if (nomesSel.length) { const i = nomesSel.findIndex((n) => a.politicos.some((p) => chavePerfil(p) === chavePerfil(n))); if (i < 0) return; cor = coresSel[i]; contagem[i]++; }
        g.addLayer(L.circleMarker([a.lat, a.lng], { renderer: rend, radius: nomesSel.length ? 5 : 4, color: '#ffffff', weight: 1, fillColor: cor, fillOpacity: 0.9 })
          .bindPopup(`<b>${esc(a.titulo)}</b><br>${esc(a.data || '')} · ${esc(a.tema || '')}${a.descricao ? '<br>' + esc(a.descricao) : ''}<br><i>${esc(a.politicos.join(', '))}</i>`));
      });
      setLegendaAcoes(nomesSel.length ? nomesSel.map((n, i) => [coresSel[i], `${n}: ${contagem[i]} ações`] as [string, string]).concat(candidatosSelecionados.length > 2 ? [['#94a3b8', 'Mostrando as ações dos 2 primeiros marcados']] : []) : [['#64748b', 'Ações de todos (marque 1 ou 2 candidatos para filtrar)']]);
    }
    if (quer.includes('obras')) {
      (extras.obras || []).forEach((o) => {
        const c = lugar(o.lat, o.lng, o.bairros);
        if (!c) return;
        g.addLayer(L.circleMarker(c, { renderer: rend, radius: 8, color: '#ffffff', weight: 2, fillColor: o.tipo === 'obra' ? '#ea580c' : '#0d9488', fillOpacity: 0.95 })
          .bindPopup(`<b>${esc(o.nome)}</b><br>${o.tipo === 'obra' ? 'Obra social' : 'Projeto social'}${o.situacao ? ' · ' + esc(o.situacao) : ''}<br>${esc(o.bairros.join(', '))}<br><i>${esc(o.politicos.join(', '))}</i>`));
      });
    }
    if (quer.includes('liderancas')) {
      (extras.liderancas || []).forEach((l) => {
        const c = lugar(l.lat, l.lng, l.bairros);
        if (!c) return;
        g.addLayer(L.circleMarker(c, { renderer: rend, radius: 9, color: '#ffffff', weight: 2, fillColor: '#7c3aed', fillOpacity: 0.95 })
          .bindPopup(`<b>${esc(l.nome)}</b>${l.apelido ? ' (' + esc(l.apelido) + ')' : ''}<br>Liderança comunitária · ${esc(l.bairros.join(', '))}${l.potencialVotos ? '<br>' + l.potencialVotos.toLocaleString('pt-BR') + ' votos possíveis (estimativa)' : ''}${l.temas.length ? '<br>' + esc(l.temas.join(', ')) : ''}${l.vinculos.length ? '<br><i>' + esc(l.vinculos.map((v) => v.pessoa).join(', ')) + '</i>' : ''}`));
      });
    }
  }, [extras, camadasExtras, candidatosSelecionados]);

  return (
    <div
      className="relative w-full h-full flex-1 flex flex-col overflow-hidden min-h-[400px]"
      style={{ height: '100%', width: '100%', minHeight: '400px' }}
    >
      <div
        ref={mapContainerRef}
        id="contagem-leaflet-map"
        className="w-full h-full flex-1 z-0"
        style={{ width: '100%', height: '100%', minHeight: '400px', flex: '1 1 auto' }}
      />

      <div className="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2">
        <button
          onClick={resetView}
          className="flex items-center justify-center w-9 h-9 text-xs font-semibold text-slate-800 bg-white/95 hover:bg-slate-100 border border-slate-300 rounded-lg shadow-md backdrop-blur-xs transition cursor-pointer"
          title="Centralizar mapa em Contagem/MG" aria-label="Centralizar mapa em Contagem/MG"
        >
          <Crosshair className="w-4 h-4 text-blue-600" />
        </button>

        <button
          onClick={fitAllPoints}
          className="flex items-center justify-center w-9 h-9 text-xs font-semibold text-slate-800 bg-white/95 hover:bg-slate-100 border border-slate-300 rounded-lg shadow-md backdrop-blur-xs transition cursor-pointer"
          title="Enquadrar todos os locais no mapa" aria-label="Enquadrar todos os locais no mapa"
        >
          <Maximize2 className="w-4 h-4 text-emerald-600" />
        </button>

        <button
          type="button"
          onClick={() => {
            const alvo = mapContainerRef.current?.parentElement as any;
            if (!alvo) return;
            if (document.fullscreenElement) document.exitFullscreen?.();
            else (alvo.requestFullscreen || alvo.webkitRequestFullscreen)?.call(alvo);
          }}
          className="flex items-center justify-center w-9 h-9 text-xs font-semibold bg-white border border-slate-300 rounded-lg shadow-sm text-slate-700 hover:bg-slate-50 cursor-pointer"
          title={telaCheia ? 'Sair da tela cheia' : 'Ver o mapa em tela cheia (Esc para sair)'}
            aria-label={telaCheia ? 'Sair da tela cheia' : 'Tela cheia'}
        >
          {telaCheia ? <Shrink className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
        </button>
        <label className="flex items-center gap-1 h-9 pl-2 pr-1 bg-white border border-slate-300 rounded-lg shadow-sm text-xs font-semibold text-slate-700" title="Camada do mapa">
            <Layers className="w-4 h-4 text-blue-600" />
            <select aria-label="Camada do mapa" value={camada} onChange={(e) => setCamada(e.target.value as typeof camada)} className="h-8 bg-transparent cursor-pointer outline-none">
              {([['escolas', 'Escolas'], ['calor', 'Calor'], ['bairros', 'Bairros'], ['regionais', 'Regionais']] as const).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
            </select>
          </label>
      </div>

      {(camadasExtras || []).includes('acoes') && legendaAcoes.length > 0 && (<div className="absolute bottom-10 right-14 z-20 bg-white/95 border border-slate-300 rounded-lg shadow-sm px-2 py-1 text-xs text-slate-700 space-y-0.5">{legendaAcoes.map(([c, t]) => <div key={t} className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full" style={{ background: c }} />{t}</div>)}</div>)}
      {(camada === 'posicao' || camada === 'demandas' || camada === 'apoio' || camada === 'censo' || camada === 'complementar') && (
        <div className="absolute top-16 left-4 z-20 max-w-[calc(100%-2rem)] bg-white/95 border border-slate-300 rounded-lg shadow-sm px-3 py-2 text-xs text-slate-700 space-y-1">
          {camada === 'complementar' && (
            <div className="space-y-1 max-w-md">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">Vale juntar?</span>
                <select value={nivelCenso} onChange={(e) => setNivelCenso(e.target.value as 'bairro' | 'regional')} className="h-7 border border-slate-300 rounded bg-white">
                  <option value="bairro">Por bairro</option>
                  <option value="regional">Por regional</option>
                </select>
              </div>
              {resumoComp?.aviso ? <div className="text-slate-600">{resumoComp.aviso}</div> : resumoComp && (
                <>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">{resumoComp.itens.map(([c, t, n]) => <span key={t} className="flex items-center gap-1"><span className="inline-block w-4 h-3 rounded-sm border border-slate-300" style={{ background: c }} />{t}: {n}</span>)}</div>
                  {resumoComp.sobreposicao !== null && (
                    <div>Sobreposição da votação: <b>{Math.round(resumoComp.sobreposicao * 100)}{String.fromCharCode(37)}</b>. {resumoComp.sobreposicao >= 0.75 ? 'Votam quase nos mesmos lugares: juntos, tendem a disputar o mesmo eleitor.' : resumoComp.sobreposicao >= 0.5 ? 'Parte da votação coincide e parte se completa.' : 'Votam em lugares bem diferentes: juntos, tendem a somar.'}</div>
                  )}
                  {resumoComp.disputa.length > 0 && <div>Onde mais disputam: {resumoComp.disputa.join(', ')}.</div>}
                  <div className="text-slate-500">Forte = índice {LIMITE_FORTE.toLocaleString('pt-BR')} ou mais (parte dos votos do candidato na área dividida pela parte do eleitorado da área). Fraco = abaixo de {LIMITE_FRACO.toLocaleString('pt-BR')}. Votos contados por local de votação, não por endereço de moradia.</div>
                </>
              )}
            </div>
          )}
          {camada === 'censo' && (
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">Censo 2022</span>
                <select value={indicadorCenso} onChange={(e) => setIndicadorCenso(e.target.value)} className="h-7 border border-slate-300 rounded bg-white max-w-64">
                  {candidatosSelecionados.length > 0 && <option value="votos">Votos dos marcados por mil pessoas de 16+</option>}
                  {INDICADORES_CENSO.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                </select>
                <select value={nivelCenso} onChange={(e) => setNivelCenso(e.target.value as 'bairro' | 'regional')} className="h-7 border border-slate-300 rounded bg-white">
                  <option value="bairro">Por bairro</option>
                  <option value="regional">Por regional</option>
                </select>
              </div>
              {censoMapa === false && <div className="text-red-700">Não foi possível ler os dados do censo.</div>}
              {legendaCenso.length > 0 && <div className="flex flex-wrap gap-x-2 gap-y-0.5">{legendaCenso.map(([c, t]) => <span key={c} className="flex items-center gap-1"><span className="inline-block w-4 h-3 rounded-sm border border-slate-300" style={{ background: c }} />{t}</span>)}</div>}
              <div className="text-slate-500">{indicadorCenso === 'votos' ? 'Compara os votos com o tamanho do eleitorado possível. A comparação por regional é a mais segura.' : 'IBGE, Censo 2022. Alguns bairros do mapa usam o dado de um bairro maior do censo; passe o mouse para ver.'}</div>
            </div>
          )}
          {camada === 'posicao' && (
            <div>
              <div className="font-semibold">Posição política por bairro</div>
              <div className="flex items-center gap-1 mt-1"><span>Direita</span>{escalaCores(escalaMapa).map((c) => <span key={c} className="inline-block w-5 h-3 rounded-sm" style={{ background: c }} />)}<span>Esquerda</span></div>
              <div className="text-slate-500 mt-1">Média dos marcados, pesada pelos votos. Usa a posição do perfil ou a do partido.{candidatosSelecionados.length === 0 ? ' Marque candidatos (ex.: todos os prefeitos de uma eleição).' : ''}</div>
            </div>
          )}
          {camada === 'demandas' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold" title="Soma os pedidos registrados em Nossas ações (indicações, requerimentos e outros) de quem está marcado, mais as demandas anotadas em Territórios. Sem ninguém marcado, conta os pedidos de todos.">{candidatosSelecionados.length ? 'Pedidos dos marcados e demandas' : 'Pedidos de todos e demandas'}</span>
              <select value={categoriaDemanda} onChange={(e) => setCategoriaDemanda(e.target.value)} className="h-7 border border-slate-300 rounded bg-white">
                <option value="">Todas as categorias</option>
                {TEMAS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              {demandasMapa && demandasMapa.length === 0 && <span className="text-slate-500">Nenhuma demanda cadastrada (aba Eleitores e demandas).</span>}
            </div>
          )}
          {camada === 'apoio' && (() => {
            const grupos = gruposApoio(candidatosSelecionados, apoiadoId);
            if (!grupos) return <div>Marque quem recebeu o apoio e quem apoiou (dois ou mais candidatos). Se marcar também uma candidatura anterior do apoiado, a medição usa o ganho entre as duas eleições.</div>;
            const { apoiado, apoiadores, antes } = grupos;
            const med = medirApoio(locais.map((l) => ({ aptos: l.totalEleitoresAptos || 0, apoiadores: apoiadores.reduce((s, c) => s + (l.votosPorCandidato[c.id] || 0), 0), apoiado: l.votosPorCandidato[apoiado.id] || 0, antes: antes ? l.votosPorCandidato[antes.id] || 0 : null })));
            const pct = (x: number | null) => (x === null ? '-' : (x * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + String.fromCharCode(37));
            const anotados = (apoiosMapa || []).filter((a) => chavePerfil(a.apoiado) === chavePerfil(pessoaDoItem(apoiado)));
            const confiavel = med.r2 !== null && med.locais >= 10 && med.r2 >= 0.1;
            return (
              <div className="space-y-1 max-w-lg">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">Quem recebeu o apoio:</span>
                  <select value={apoiado.id} onChange={(e) => setApoiadoId(e.target.value)} className="h-7 border border-slate-300 rounded bg-white max-w-64">
                    {candidatosSelecionados.map((c) => <option key={c.id} value={c.id}>{c.nome} ({c.ano})</option>)}
                  </select>
                </div>
                <div>Quem apoiou: {apoiadores.map((c) => c.nome + ' (' + c.ano + ')').join(', ')}{antes ? '. Eleição anterior do apoiado: ' + antes.ano : ''}</div>
                {apoiadores.map((c) => { const rel = relacaoEntre(relacoesMapa || [], pessoaDoItem(c), pessoaDoItem(apoiado)); return rel ? <div key={c.id} className={`px-2 py-0.5 rounded ${TIPOS_RELACAO[rel.tipo].classe}`}><span className="font-semibold">{c.nome}: {TIPOS_RELACAO[rel.tipo].nome}</span>{rel.motivo ? ': ' + rel.motivo : ''}{rel.tipo === 'rompido' || rel.tipo === 'incompativel' ? ' (apoio pouco provável)' : ''}</div> : null; })}
                <div className="border-t border-slate-200 pt-1">
                  <div className="font-semibold">Resultado medido</div>
                  {med.conversao === null ? <div className="text-slate-500">Poucos locais com votos para medir.</div> : (
                    <>
                      <div>Conversão estimada: <b>{pct(Math.max(0, med.conversao))}</b> dos votos de quem apoiou{med.convertidos !== null ? ', cerca de ' + med.convertidos.toLocaleString('pt-BR') + ' votos' : ''}.</div>
                      <div>{antes ? 'Ganho do apoiado' : 'Votação do apoiado'} por eleitor: {pct(med.taxaFortes)} onde quem apoiou era mais forte, contra {pct(med.taxaFracos)} onde era mais fraco.</div>
                      <div className={confiavel ? 'text-slate-500' : 'text-amber-700'}>{confiavel ? 'Relação clara entre os votos de quem apoiou e os do apoiado' : 'Relação fraca: o número pode ser acaso'} ({med.locais} locais de votação, força {pct(med.r2)}).</div>
                    </>
                  )}
                  <div className="text-slate-500">É uma estimativa: mostra se o apoiado foi melhor onde os apoiadores eram fortes, mas não prova que o voto veio do apoio. Fica mais segura quando a eleição anterior do apoiado também está marcada.</div>
                </div>
                <div className="border-t border-slate-200 pt-1 flex flex-wrap items-center gap-2">
                  <span className="font-semibold">Simulação:</span>
                  <input type="range" min={0} max={100} step={5} value={taxaApoio} onChange={(e) => setTaxaApoio(Number(e.target.value))} />
                  <span>{taxaApoio}{String.fromCharCode(37)} de transferência</span>
                  <span>= {(med.votosApoiado + Math.round((med.votosApoiadores * taxaApoio) / 100)).toLocaleString('pt-BR')} votos para {apoiado.nome}</span>
                </div>
                {anotados.length > 0 && <div className="text-slate-600">Apoios já anotados para {pessoaDoItem(apoiado)}: {anotados.map((a) => a.apoiadores.join(', ') + (a.eleicao ? ' (' + a.eleicao + ')' : '') + (a.conversao != null ? ', conversão ' + pct(a.conversao) : '')).join(' · ')}</div>}
                {podeInserirArea('relacoes') && (
                  <button type="button" disabled={salvandoApoio} onClick={async () => {
                    const novo = { id: 'ap' + Date.now(), apoiado: pessoaDoItem(apoiado), apoiadores: apoiadores.map((c) => pessoaDoItem(c)), eleicao: apoiado.ano + ' ' + apoiado.cargo, conversao: med.conversao === null ? undefined : Math.round(Math.max(0, med.conversao) * 1000) / 1000, votosConvertidos: med.convertidos ?? undefined, data: new Date().toISOString().slice(0, 10) };
                    if (!window.confirm('Anotar este apoio no perfil?\n\nApoiado: ' + novo.apoiado + '\nQuem apoiou: ' + novo.apoiadores.join(', ') + '\nEleição: ' + novo.eleicao + (novo.conversao !== undefined ? '\nConversão medida: ' + pct(novo.conversao) : ''))) return;
                    setSalvandoApoio(true);
                    try {
                      const r = await gravarApoio({ token: getStoredGitHubToken(), repo: getStoredGitHubRepo(), branch: getStoredGitHubBranch() || 'main' }, novo);
                      setApoiosMapa([...(apoiosMapa || []), novo]);
                      window.alert(r.pendente ? 'Enviado para aprovação.' : 'Apoio anotado.');
                    } catch (er: any) {
                      window.alert('Não foi possível gravar: ' + (er?.message || 'erro'));
                    } finally {
                      setSalvandoApoio(false);
                    }
                  }} className="h-7 px-2 rounded border border-slate-300 bg-white cursor-pointer disabled:opacity-50">{salvandoApoio ? 'Gravando...' : 'Anotar este apoio no perfil'}</button>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {!hasAnyPublishedData && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-white/60 backdrop-blur-xs pointer-events-none">
          <div className="bg-slate-100 border border-slate-300 p-6 rounded-2xl shadow-2xl max-w-sm text-center space-y-3 pointer-events-auto">
            <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 flex items-center justify-center mx-auto">
              <Upload className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">
              {onAbrirGestao ? 'Nenhum dado publicado ainda' : 'Nenhum candidato disponível'}
            </h3>
            {onAbrirGestao ? (
              <p className="text-xs text-slate-700 leading-relaxed">
                O mapa está pronto e posicionado em Contagem/MG. Acesse a área de <strong>Gestão de dados</strong> para carregar os arquivos dos candidatos.
              </p>
            ) : (
              <p className="text-xs text-slate-700 leading-relaxed">
                Não há candidatos liberados para o seu usuário. Fale com o responsável pelo mapa.
              </p>
            )}
            {onAbrirGestao && (
              <button
                onClick={onAbrirGestao}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold shadow-md transition cursor-pointer"
              >
                Abrir Gestão de Dados
              </button>
            )}
          </div>
        </div>
      )}

      {candidatosSelecionados.length > 0 && !legendaAberta && (
        <button
          type="button"
          onClick={() => setLegendaAberta(true)}
          className="absolute bottom-6 left-4 z-20 bg-white border border-slate-300 rounded-lg shadow-md px-3 py-2 text-xs font-semibold text-slate-800 cursor-pointer"
          title="Mostrar candidatos marcados"
        >
          Marcados ({candidatosSelecionados.length}) ▴
        </button>
      )}
      {candidatosSelecionados.length > 0 && legendaAberta && (
        <div className="absolute bottom-6 left-4 z-20 bg-white/95 border border-slate-200 rounded-xl p-3 shadow-xl backdrop-blur-md max-w-xs text-xs text-slate-800 select-none">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 mb-2">
            <span className="font-semibold text-slate-900 tracking-wide text-[11px] uppercase">
              Candidatos Marcados ({candidatosSelecionados.length})
            </span>
            <span className="text-[10px] text-blue-600 font-mono">
              {modoVisualizacao === 'somar' ? 'Modo: Somar' : modoVisualizacao === 'diferenca' ? 'Modo: Diferença' : 'Modo: Lado a Lado'}
            </span>
          <button type="button" onClick={() => setLegendaAberta(false)} className="ml-2 w-7 h-7 flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 cursor-pointer" title="Minimizar" aria-label="Minimizar quadro de candidatos marcados">▾</button>
          </div>

          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {candidatosSelecionados.map((cand) => {
              const totalVotos = locais.reduce((acc, loc) => acc + (loc.votosPorCandidato[cand.id] || 0), 0);
              return (
                <div key={cand.id} className="flex items-center justify-between gap-2 text-[11px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {modoVisualizacao !== 'diferenca' && (
                      <span
                        className="w-3 h-3 rounded-full shrink-0 border border-white/20"
                        style={{ backgroundColor: cand.cor }}
                      />
                    )}
                    <span className="truncate text-slate-800">
                      {cand.nome} {cand.numero ? `(${cand.numero})` : ''} {cand.ano}
                    </span>
                  </div>
                  <span className="font-mono tabular-nums text-slate-700 shrink-0">
                    {totalVotos.toLocaleString('pt-BR')}
                  </span>
                </div>
              );
            })}
          </div>

          {modoVisualizacao === 'diferenca' ? (
            <div className="mt-2 pt-2 border-t border-slate-200 text-[10px] text-slate-600 space-y-1">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COR_CRESCEU }} /> Cresceu
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COR_CAIU }} /> Caiu
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full border-2 border-dashed border-slate-500 bg-white" /> Sem correspondência
                </span>
              </div>
              <div>Tamanho = tamanho da diferença. Aproxime o mapa para ver os números.</div>
            </div>
          ) : (
            <div className="mt-2 pt-2 border-t border-slate-200 text-[10px] text-slate-500 flex items-center justify-between gap-2">
              <span>Tamanho = votação</span>
              <span>Aproxime para ver os números</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
