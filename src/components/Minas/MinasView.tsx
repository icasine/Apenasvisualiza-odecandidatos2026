import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, X, Users, Map as MapIcon, Table2, AlertTriangle } from 'lucide-react';
import { CARGOS_DISPONIVEIS } from '../../types/election';
import { fetchDataFile } from '../../utils/dataLoader';
import {
  MunicipioMG,
  MinasIndice,
  MinasItemInfo,
  MinasArquivo,
  carregarMalhaMG,
  carregarIndiceMinas,
  limitesPorQuantis,
  limitesParaPercentual,
  corPorValor,
  corValida,
  escaparHtml,
  RAMPA_AZUL,
  rampaDaCor,
  COR_SEM_VOTO
} from '../../utils/minas';

type ModoMinas = 'intensidade' | 'lider' | 'percentual' | 'comparar';
type FormaMinas = 'areas' | 'circulos';
type PainelMinas = 'itens' | 'mapa' | 'tabela';

interface LinhaMunicipio {
  cod: string;
  nome: string;
  votosPorItem: Record<string, number>;
  pctPorItem: Record<string, number | undefined>;
  total: number;
  lider: string | null;
}

const fmt = (n: number) => n.toLocaleString('pt-BR');
const fmtPct = (n: number) => `${n.toFixed(2).replace('.', ',')}%`;
const fmtFaixa = (v: number) => (Number.isInteger(v) ? `${v}%` : fmtPct(v));

export const MinasView: React.FC = () => {
  const [malha, setMalha] = useState<MunicipioMG[] | null>(null);
  const [erroMalha, setErroMalha] = useState<string | null>(null);
  const [indice, setIndice] = useState<MinasIndice | null>(null);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [votosPorItem, setVotosPorItem] = useState<Record<string, Record<string, number>>>({});
  const [pctPorItem, setPctPorItem] = useState<Record<string, Record<string, number>>>({});
  const [itensComErro, setItensComErro] = useState<string[]>([]);
  const [modo, setModo] = useState<ModoMinas>('intensidade');
  const [forma, setForma] = useState<FormaMinas>('areas');
  const [painel, setPainel] = useState<PainelMinas>('mapa');
  const [busca, setBusca] = useState('');
  const [verTodos, setVerTodos] = useState(false);
  const [esquerdaAberta, setEsquerdaAberta] = useState(true);
  const [direitaAberta, setDireitaAberta] = useState(true);
  const secaoMapaRef = useRef<HTMLElement | null>(null);
  const tabelaAberta = verTodos || busca.trim() !== '';
  const [municipioSel, setMunicipioSel] = useState<string | null>(null);
  const [ordem, setOrdem] = useState<{ campo: string; crescente: boolean }>({ campo: 'total', crescente: false });
  const [mostrarNumeros, setMostrarNumeros] = useState(true);
  const [visaoMapa, setVisaoMapa] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const areasRef = useRef<any>(null);
  const circulosRef = useRef<any>(null);
  const rotulosRef = useRef<any>(null);
  const buscasRef = useRef<Set<string>>(new Set());
  const dadosRef = useRef<{
    linhas: Map<string, LinhaMunicipio>;
    limites: number[];
    limitesPct: number[];
    rampa: string[];
    itemPct: string | null;
    modo: ModoMinas;
    forma: FormaMinas;
    itens: MinasItemInfo[];
    municipioSel: string | null;
  }>({ linhas: new Map(), limites: [], limitesPct: [], rampa: RAMPA_AZUL, itemPct: null, modo: 'intensidade', forma: 'areas', itens: [], municipioSel: null });

  useEffect(() => {
    let vivo = true;
    carregarMalhaMG()
      .then((m) => vivo && setMalha(m))
      .catch((e) => vivo && setErroMalha(e?.message || 'Não foi possível carregar o mapa dos municípios.'));
    carregarIndiceMinas()
      .then((i) => {
        if (!vivo) return;
        setIndice(i);
      })
      .catch(() => vivo && setIndice({ atualizacao: null, itens: [] }));
    return () => {
      vivo = false;
    };
  }, []);

  const itensMarcados = useMemo<MinasItemInfo[]>(
    () => (indice ? indice.itens : []).filter((i) => selecionados.includes(i.id)),
    [indice, selecionados]
  );

  useEffect(() => {
    itensMarcados.forEach((item) => {
      if (votosPorItem[item.id] || buscasRef.current.has(item.id) || item.id.startsWith('previa_')) return;
      buscasRef.current.add(item.id);
      fetchDataFile<MinasArquivo>(item.arquivo)
        .catch(() => null)
        .then((arq) => {
          if (!arq || !Array.isArray(arq.municipios)) {
            setItensComErro((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]));
            setVotosPorItem((prev) => ({ ...prev, [item.id]: {} }));
            return;
          }
          const mapa: Record<string, number> = {};
          const percentuais: Record<string, number> = {};
          arq.municipios.forEach((registro) => {
            const cod = String(registro[0]);
            mapa[cod] = Number(registro[1]) || 0;
            const pct = Number(registro[2]);
            if (registro.length > 2 && Number.isFinite(pct)) percentuais[cod] = pct;
          });
          setVotosPorItem((prev) => ({ ...prev, [item.id]: mapa }));
          if (Object.keys(percentuais).length > 0) setPctPorItem((prev) => ({ ...prev, [item.id]: percentuais }));
        })
        .finally(() => buscasRef.current.delete(item.id));
    });
  }, [itensMarcados, votosPorItem]);

  const linhas = useMemo<LinhaMunicipio[]>(() => {
    if (!malha) return [];
    return malha.map((m) => {
      const porItem: Record<string, number> = {};
      const pcts: Record<string, number | undefined> = {};
      let total = 0;
      let lider: string | null = null;
      let maior = 0;
      itensMarcados.forEach((item) => {
        const v = votosPorItem[item.id]?.[m.cod] || 0;
        porItem[item.id] = v;
        pcts[item.id] = pctPorItem[item.id]?.[m.cod];
        total += v;
        if (v > maior) {
          maior = v;
          lider = item.id;
        }
      });
      return { cod: m.cod, nome: m.nome, votosPorItem: porItem, pctPorItem: pcts, total, lider };
    });
  }, [malha, itensMarcados, votosPorItem, pctPorItem]);

  const itemComPct = itensMarcados.length === 1 && pctPorItem[itensMarcados[0].id] ? itensMarcados[0].id : null;
  const modoEfetivo: ModoMinas =
    modo === 'percentual' && !itemComPct
      ? 'intensidade'
      : modo === 'lider' && itensMarcados.length < 2
        ? 'intensidade'
        : modo === 'comparar' && itensMarcados.length !== 2
          ? 'intensidade'
          : modo;
  const limitesPct = useMemo(
    () => (itemComPct ? limitesParaPercentual(linhas.map((l) => l.pctPorItem[itemComPct] || 0)) : []),
    [linhas, itemComPct]
  );
  const corDoUnico = itensMarcados.length === 1 ? corValida(itensMarcados[0].cor) : '';
  const rampa = useMemo(() => (corDoUnico ? rampaDaCor(corDoUnico) : RAMPA_AZUL), [corDoUnico]);

  const totais = useMemo(() => {
    const porItem: Record<string, number> = {};
    let geral = 0;
    let comVoto = 0;
    linhas.forEach((l) => {
      if (l.total > 0) comVoto++;
      geral += l.total;
      itensMarcados.forEach((i) => {
        porItem[i.id] = (porItem[i.id] || 0) + (l.votosPorItem[i.id] || 0);
      });
    });
    return { porItem, geral, comVoto };
  }, [linhas, itensMarcados]);

  const limites = useMemo(() => limitesPorQuantis(linhas.map((l) => l.total)), [linhas]);

  const linhasTabela = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const filtradas = termo ? linhas.filter((l) => l.nome.toLowerCase().includes(termo)) : linhas;
    const fator = ordem.crescente ? 1 : -1;
    return [...filtradas].sort((a, b) => {
      if (ordem.campo === 'nome') return fator * a.nome.localeCompare(b.nome, 'pt-BR');
      if (ordem.campo === 'pct' && itemComPct) {
        return fator * ((a.pctPorItem[itemComPct] || 0) - (b.pctPorItem[itemComPct] || 0)) || a.nome.localeCompare(b.nome, 'pt-BR');
      }
      const va = ordem.campo === 'total' ? a.total : a.votosPorItem[ordem.campo] || 0;
      const vb = ordem.campo === 'total' ? b.total : b.votosPorItem[ordem.campo] || 0;
      return fator * (va - vb) || a.nome.localeCompare(b.nome, 'pt-BR');
    });
  }, [linhas, busca, ordem, itemComPct]);

  const posicaoPorTotal = useMemo(() => {
    const mapa = new Map<string, number>();
    [...linhas]
      .sort((a, b) => b.total - a.total)
      .forEach((l, i) => mapa.set(l.cod, i + 1));
    return mapa;
  }, [linhas]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapaRef.current) return;
    const mapa = L.map(el, { center: [-18.6, -44.6], zoom: 6, minZoom: 5, maxZoom: 13, zoomControl: false });
    L.control.zoom({ position: 'bottomright' }).addTo(mapa);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(mapa);
    mapaRef.current = mapa;
    mapa.on('zoomend moveend', () => setVisaoMapa((n) => n + 1));

    let observador: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observador = new ResizeObserver(() => mapa.invalidateSize());
      observador.observe(el);
    }
    const temporizador = setTimeout(() => mapa.invalidateSize(), 200);
    return () => {
      clearTimeout(temporizador);
      if (observador) observador.disconnect();
      mapa.off();
      mapa.stop();
      (mapa as any)._animatingZoom = false;
      mapa.remove();
      mapaRef.current = null;
      areasRef.current = null;
      circulosRef.current = null;
      rotulosRef.current = null;
    };
  }, []);

  const estiloDaArea = (cod: string) => {
    const d = dadosRef.current;
    const linha = d.linhas.get(cod);
    const selecionado = d.municipioSel === cod;
    let preenchimento = COR_SEM_VOTO;
    if (linha && linha.total > 0) {
      if ((d.modo === 'lider' || d.modo === 'comparar') && linha.lider) {
        const item = d.itens.find((i) => i.id === linha.lider);
        preenchimento = corValida(item?.cor);
      } else if (d.modo === 'percentual' && d.itemPct) {
        preenchimento = corPorValor(linha.pctPorItem[d.itemPct] || 0, d.limitesPct, d.rampa);
      } else {
        preenchimento = corPorValor(linha.total, d.limites, d.rampa);
      }
    }
    const soContorno = d.forma === 'circulos';
    const temVoto = Boolean(linha && linha.total > 0);
    return {
      color: selecionado ? '#0b0b0b' : temVoto && !soContorno ? '#ffffff' : '#8a94a3',
      weight: selecionado ? 2.5 : 0.6,
      fillColor: soContorno ? '#ffffff' : preenchimento,
      fillOpacity: soContorno ? 0.2 : temVoto ? 0.85 : 0.45
    };
  };

  const textoDaDica = (cod: string, nome: string) => {
    const d = dadosRef.current;
    const linha = d.linhas.get(cod);
    const partes = d.itens
      .map((item) => {
        const v = linha?.votosPorItem[item.id] || 0;
        const pct = linha?.pctPorItem[item.id];
        const textoPct = pct !== undefined ? ` <span style="font-weight:400;color:#475569;">(${fmtPct(pct)} dos válidos)</span>` : '';
        return `<div style="display:flex;justify-content:space-between;gap:12px;font-size:11px;color:#334155;"><span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${corValida(item.cor)};margin-right:4px;"></span>${escaparHtml(item.nome)}</span><strong style="color:#0f172a;font-variant-numeric: tabular-nums;">${fmt(v)}${textoPct}</strong></div>`;
      })
      .join('');
    const total =
      d.itens.length > 1
        ? `<div style="display:flex;justify-content:space-between;gap:12px;font-size:11px;font-weight:700;color:#0f172a;border-top:1px solid rgba(15,23,42,0.12);margin-top:3px;padding-top:3px;"><span>Total</span><span style="font-variant-numeric: tabular-nums;">${fmt(linha?.total || 0)}</span></div>`
        : '';
    const corpo = d.itens.length > 0 ? partes + total : '<div style="font-size:11px;color:#475569;">Nenhum item marcado</div>';
    return `<div><div style="font-weight:700;font-size:13px;color:#0f172a;margin-bottom:3px;">${escaparHtml(nome)}</div>${corpo}</div>`;
  };

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !malha || areasRef.current) return;
    const colecao = {
      type: 'FeatureCollection',
      features: malha.map((m) => ({ type: 'Feature', properties: { cod: m.cod, nome: m.nome }, geometry: m.geo }))
    };
    const camada = L.geoJSON(colecao as any, {
      style: (f: any) => estiloDaArea(f.properties.cod),
      onEachFeature: (f: any, layer: any) => {
        layer.bindTooltip(() => textoDaDica(f.properties.cod, f.properties.nome), {
          className: 'custom-leaflet-tooltip',
          sticky: true
        });
        layer.on('click', () => setMunicipioSel(f.properties.cod));
      }
    }).addTo(mapa);
    areasRef.current = camada;
    circulosRef.current = L.layerGroup().addTo(mapa);
    rotulosRef.current = L.layerGroup().addTo(mapa);
    const limitesMapa = camada.getBounds();
    const enquadrar = () => {
      if (!mapaRef.current || !limitesMapa.isValid()) return;
      mapaRef.current.invalidateSize();
      mapaRef.current.fitBounds(limitesMapa, { padding: [10, 10] });
    };
    enquadrar();
    setTimeout(enquadrar, 350);
  }, [malha]);

  useEffect(() => {
    const porCodigo = new Map<string, LinhaMunicipio>();
    linhas.forEach((l) => porCodigo.set(l.cod, l));
    dadosRef.current = { linhas: porCodigo, limites, limitesPct, rampa, itemPct: itemComPct, modo: modoEfetivo, forma, itens: itensMarcados, municipioSel };

    const camada = areasRef.current;
    if (camada) camada.setStyle((f: any) => estiloDaArea(f.properties.cod));
    if (camada && modoEfetivo === 'comparar' && itensMarcados.length === 2 && forma === 'areas') {
      const svg = mapaRef.current?.getPanes().overlayPane.querySelector('svg');
      if (svg) {
        let defs = svg.querySelector('defs#defs-comparar') as SVGDefsElement | null;
        if (!defs) {
          defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs') as SVGDefsElement;
          defs.setAttribute('id', 'defs-comparar');
          svg.insertBefore(defs, svg.firstChild);
        }
        defs.innerHTML = '';
        const [ia, ib] = itensMarcados;
        const corA = corValida(ia.cor);
        const corB = corValida(ib.cor) === corA ? '#eb6834' : corValida(ib.cor);
        camada.eachLayer((layer: any) => {
          const cod = layer?.feature?.properties?.cod;
          const linha = porCodigo.get(cod);
          const a = linha?.votosPorItem[ia.id] || 0;
          const b = linha?.votosPorItem[ib.id] || 0;
          if (!layer._path || a + b <= 0) return;
          const parte = ((a / (a + b)) * 100).toFixed(1);
          const id = `cmp-${cod}`;
          const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
          grad.setAttribute('id', id);
          grad.innerHTML = `<stop offset="${parte}%" stop-color="${corA}"/><stop offset="${parte}%" stop-color="${corB}"/>`;
          defs!.appendChild(grad);
          layer._path.setAttribute('fill', `url(#${id})`);
        });
      }
    }

    const grupo = circulosRef.current;
    if (grupo && malha) {
      grupo.clearLayers();
      if (forma === 'circulos') {
        const porPct = modoEfetivo === 'percentual' && Boolean(itemComPct);
        const medida = (l: LinhaMunicipio) => (porPct ? l.pctPorItem[itemComPct as string] || 0 : l.total);
        const maior = Math.max(porPct ? 0.01 : 1, ...linhas.map(medida));
        malha.forEach((m) => {
          const linha = porCodigo.get(m.cod);
          if (!linha || linha.total <= 0) return;
          const item = modoEfetivo === 'lider' && linha.lider ? itensMarcados.find((i) => i.id === linha.lider) : null;
          const cor = item ? corValida(item.cor) : itensMarcados.length === 1 ? corValida(itensMarcados[0].cor) : '#2a78d6';
          const circulo = L.circleMarker(m.centro, {
            radius: Math.max(3, Math.sqrt(medida(linha) / maior) * 26),
            color: '#ffffff',
            weight: 1.2,
            fillColor: cor,
            fillOpacity: 0.8
          });
          circulo.bindTooltip(() => textoDaDica(m.cod, m.nome), { className: 'custom-leaflet-tooltip', direction: 'top' });
          circulo.on('click', () => setMunicipioSel(m.cod));
          grupo.addLayer(circulo);
        });
      }
    }
  }, [linhas, limites, limitesPct, rampa, itemComPct, modoEfetivo, forma, itensMarcados, municipioSel, malha]);

  useEffect(() => {
    const mapa = mapaRef.current;
    const grupo = rotulosRef.current;
    if (!mapa || !grupo || !malha) return;
    grupo.clearLayers();
    if (!mostrarNumeros || itensMarcados.length === 0) return;

    const porCodigo = new Map<string, LinhaMunicipio>();
    linhas.forEach((l) => porCodigo.set(l.cod, l));
    const zoom = mapa.getZoom();
    const areaVisivel = mapa.getBounds().pad(0.05);
    const porPct = modoEfetivo === 'percentual' && Boolean(itemComPct);
    const visiveis: Array<{ m: MunicipioMG; total: number }> = [];
    malha.forEach((m) => {
      const linha = porCodigo.get(m.cod);
      const total = porPct ? linha?.pctPorItem[itemComPct as string] || 0 : linha?.total || 0;
      if (total > 0 && areaVisivel.contains(m.centro)) visiveis.push({ m, total });
    });
    visiveis.sort((a, b) => b.total - a.total);

    const maximo = zoom >= 9 ? 500 : zoom >= 8 ? 160 : zoom >= 7 ? 60 : 25;
    const comNome = zoom >= 8;
    const ocupados: Array<[number, number, number, number]> = [];
    visiveis.slice(0, maximo).forEach(({ m, total }) => {
      const texto = porPct ? fmtPct(total) : fmt(total);
      const p = mapa.latLngToContainerPoint(m.centro as any);
      const largura = Math.max(texto.length, comNome ? Math.min(m.nome.length, 22) : 0) * 7 + 10;
      const altura = comNome ? 30 : 16;
      const caixa: [number, number, number, number] = [p.x - largura / 2, p.y - altura / 2, p.x + largura / 2, p.y + altura / 2];
      if (ocupados.some((o) => caixa[0] < o[2] && caixa[2] > o[0] && caixa[1] < o[3] && caixa[3] > o[1])) return;
      ocupados.push(caixa);
      const nome = comNome ? `<span class="rotulo-minas-nome">${escaparHtml(m.nome)}</span>` : '';
      const icone = L.divIcon({ className: 'rotulo-minas', html: `<span>${nome}${porPct ? fmtPct(total) : fmt(total)}</span>`, iconSize: [0, 0] });
      grupo.addLayer(L.marker(m.centro, { icon: icone, interactive: false, keyboard: false }));
    });
  }, [linhas, itensMarcados, malha, visaoMapa, mostrarNumeros, modoEfetivo, itemComPct]);

  const alternarItem = (id: string) => {
    setSelecionados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const irParaMunicipio = (cod: string) => {
    setMunicipioSel(cod);
    setPainel('mapa');
    const m = malha?.find((x) => x.cod === cod);
    if (m && mapaRef.current) mapaRef.current.flyTo(m.centro, 9, { duration: 0.8 });
  };

  const ordenarPor = (campo: string) => {
    setOrdem((prev) => (prev.campo === campo ? { campo, crescente: !prev.crescente } : { campo, crescente: campo === 'nome' }));
  };

  const linhaSelecionada = municipioSel ? linhas.find((l) => l.cod === municipioSel) || null : null;
  const anos = indice ? Array.from(new Set(indice.itens.map((i) => i.ano))).sort().reverse() : [];
  const semItens = Boolean(indice && indice.itens.length === 0);
  const carregandoIndice = indice === null;
  const carregandoVotos = itensMarcados.some((i) => !i.id.startsWith('previa_') && !votosPorItem[i.id]);
  const seta = (campo: string) => (ordem.campo === campo ? (ordem.crescente ? ' ▲' : ' ▼') : '');
  const classeBotaoPainel = (p: PainelMinas) =>
    `flex-1 flex items-center justify-center gap-1.5 h-10 text-xs font-semibold rounded-lg border cursor-pointer ${
      painel === p ? 'bg-slate-100 border-slate-300 text-slate-900' : 'bg-white border-transparent text-slate-500'
    }`;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white text-slate-900">
      <div className="shrink-0 border-b border-slate-200 px-3 sm:px-6 py-2 flex flex-wrap items-center gap-x-6 gap-y-1">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Minas Gerais por município</div>
          <div className="text-sm font-semibold text-slate-900 truncate">
            {carregandoIndice ? 'Carregando a lista de itens...' : itensMarcados.length === 0 ? 'Nenhum item marcado' : itensMarcados.map((i) => `${i.nome} (${i.numero})`).join(', ')}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Total de votos</div>
          <div className="font-mono tabular-nums font-bold text-slate-900">{carregandoIndice || carregandoVotos ? 'carregando...' : fmt(totais.geral)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Municípios com voto</div>
          <div className="font-mono tabular-nums font-bold text-slate-900">
            {fmt(totais.comVoto)} de {fmt(linhas.length)}
          </div>
        </div>
      </div>

      <div className="lg:hidden shrink-0 flex items-center gap-1 px-3 py-1.5 border-b border-slate-200">
        <button onClick={() => setPainel('itens')} className={classeBotaoPainel('itens')}>
          <Users className="w-4 h-4" />
          <span>Candidatos</span>
        </button>
        <button onClick={() => setPainel('mapa')} className={classeBotaoPainel('mapa')}>
          <MapIcon className="w-4 h-4" />
          <span>Mapa</span>
        </button>
        <button onClick={() => setPainel('tabela')} className={classeBotaoPainel('tabela')}>
          <Table2 className="w-4 h-4" />
          <span>Tabela</span>
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <aside
          className={`${painel === 'itens' ? 'flex' : 'hidden'} ${esquerdaAberta ? 'lg:flex' : 'lg:hidden'} flex-col w-full lg:w-72 shrink-0 border-r border-slate-200 overflow-y-auto p-3 gap-4 text-xs`}
        >
          <div className="space-y-2">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Itens publicados{indice ? ` (${indice.itens.length})` : ''}
            </div>
            {carregandoIndice && (
              <div role="status" className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-800">
                Carregando os itens publicados. Pode levar alguns segundos.
              </div>
            )}
          {semItens && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700">
                Nenhum dado de Minas publicado ainda.
              </div>
            )}
            {anos.map((ano) => (
              <div key={ano} className="bg-slate-50 border border-slate-200 rounded-xl p-2 space-y-1.5">
                <div className="font-bold text-slate-900">Eleição {ano}</div>
                {indice!.itens
                  .filter((i) => i.ano === ano)
                  .map((item) => {
                    const marcado = selecionados.includes(item.id);
                    return (
                      <label
                        key={item.id}
                        className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer ${
                          marcado ? 'bg-white border-blue-500' : 'bg-white border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <input type="checkbox" checked={marcado} onChange={() => alternarItem(item.id)} className="mt-0.5" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: corValida(item.cor) }} />
                            <span className="font-semibold text-slate-900 truncate">{item.nome}</span>
                          </span>
                          <span className="block text-[11px] text-slate-500">
                            Nº {item.numero} · {CARGOS_DISPONIVEIS[item.cargo] || item.cargo}
                            {item.partido ? ` · ${item.partido}` : ''}
                          </span>
                          {item.situacao && <span className="block text-[11px] text-slate-700">{item.situacao}</span>}
                          <span className="block text-[11px] font-mono text-slate-700">
                            {fmt(item.totalVotos)} votos em {fmt(item.totalMunicipios)} municípios
                          </span>
                        </span>
                      </label>
                    );
                  })}
              </div>
            ))}
            {itensComErro.length > 0 && (
              <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 flex gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Não foi possível ler os votos de {itensComErro.length} item(ns). Os números deles aparecem como zero.</span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">O que o mapa mostra</div>
            <div className="grid grid-cols-3 gap-1">
              <button
                onClick={() => setModo('intensidade')}
                className={`h-10 rounded-lg border font-semibold cursor-pointer ${modoEfetivo === 'intensidade' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-700'}`}
              >
                Votos
              </button>
              <button
                onClick={() => setModo('percentual')}
                disabled={!itemComPct}
                className={`h-10 rounded-lg border font-semibold cursor-pointer disabled:opacity-40 ${modoEfetivo === 'percentual' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-700'}`}
                title="Com um item só marcado, pinta cada município pelo percentual dos votos válidos que ele teve ali"
              >
                Percentual
              </button>
              <button
                onClick={() => setModo('lider')}
                disabled={itensMarcados.length < 2}
                className={`h-10 rounded-lg border font-semibold cursor-pointer disabled:opacity-40 ${modoEfetivo === 'lider' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-700'}`}
                title="Com dois ou mais itens marcados, pinta cada município com a cor de quem teve mais votos"
              >
                Quem lidera
              </button>
              <button
                onClick={() => setModo('comparar')}
                disabled={itensMarcados.length !== 2}
                className={`h-9 px-2 rounded-md border text-xs font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${modoEfetivo === 'comparar' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300'}`}
                title="Com dois itens marcados, divide cada município em duas cores, na proporção dos votos de cada um"
              >
                Comparar 2
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              {modoEfetivo === 'percentual'
                ? 'Percentual: quanto dos votos válidos de cada município foi para o item marcado. Mostra onde ele é forte, mesmo em cidade pequena.'
                : modoEfetivo === 'comparar'
                ? 'Comparar 2: cada município dividido nas cores dos dois itens. Metade e metade quando empatam; quem tem mais votos ocupa mais espaço.'
                : modoEfetivo === 'lider'
                ? 'Quem lidera: cada município com a cor do item marcado que teve mais votos ali.'
                : 'Votos: soma dos itens marcados em cada município. Percentual vale com um item só marcado; Quem lidera, com dois ou mais.'}
            </p>
            <div className="grid grid-cols-2 gap-1">
              <button
                onClick={() => setForma('areas')}
                className={`h-10 rounded-lg border font-semibold cursor-pointer ${forma === 'areas' ? 'bg-slate-100 border-slate-400 text-slate-900' : 'bg-white border-slate-300 text-slate-700'}`}
              >
                Áreas
              </button>
              <button
                onClick={() => setForma('circulos')}
                className={`h-10 rounded-lg border font-semibold cursor-pointer ${forma === 'circulos' ? 'bg-slate-100 border-slate-400 text-slate-900' : 'bg-white border-slate-300 text-slate-700'}`}
              >
                Círculos
              </button>
            </div>
            <label className="flex items-center gap-2 h-10 px-2 bg-white border border-slate-300 rounded-lg cursor-pointer">
              <input type="checkbox" checked={mostrarNumeros} onChange={() => setMostrarNumeros(!mostrarNumeros)} />
              <span className="font-semibold text-slate-700">Números de votos no mapa</span>
            </label>
            <p className="text-[11px] text-slate-500">
              De longe aparecem os números dos municípios com mais votos. Aproxime o mapa para ver o número de todos.
            </p>
            <p className="text-[11px] text-slate-500">
              Áreas pintam o município inteiro. Círculos mostram o tamanho da votação e evitam que município grande em área pareça mais importante.
            </p>
          </div>
        </aside>

        <section ref={secaoMapaRef as any} className={`${painel === 'mapa' ? 'flex' : 'hidden'} lg:flex flex-1 relative min-w-0`}>
          <div className="hidden lg:flex absolute top-3 left-3 z-[1000] gap-1">
            <button type="button" onClick={() => setEsquerdaAberta(!esquerdaAberta)} title={esquerdaAberta ? 'Recolher o painel de itens' : 'Mostrar o painel de itens'} className="h-8 px-2 bg-white border border-slate-300 rounded-lg shadow-sm text-xs font-semibold text-slate-700 cursor-pointer">{esquerdaAberta ? '‹ Itens' : '› Itens'}</button>
            <button
              type="button"
              onClick={() => {
                const alvo: any = secaoMapaRef.current;
                if (!alvo) return;
                if (document.fullscreenElement) document.exitFullscreen?.();
                else (alvo.requestFullscreen || alvo.webkitRequestFullscreen)?.call(alvo);
              }}
              title="Ver o mapa em tela cheia (Esc para sair)"
              className="h-8 px-2 bg-white border border-slate-300 rounded-lg shadow-sm text-xs font-semibold text-slate-700 cursor-pointer"
            >
              ⛶ Tela cheia
            </button>
          </div>
          <div className="hidden lg:flex absolute top-3 right-3 z-[1000]">
            <button type="button" onClick={() => setDireitaAberta(!direitaAberta)} title={direitaAberta ? 'Recolher a lista de municípios' : 'Mostrar a lista de municípios'} className="h-8 px-2 bg-white border border-slate-300 rounded-lg shadow-sm text-xs font-semibold text-slate-700 cursor-pointer">{direitaAberta ? 'Municípios ›' : '‹ Municípios'}</button>
          </div>
          <div ref={containerRef} className="w-full h-full z-0" style={{ minHeight: '320px' }} />

          {!malha && !erroMalha && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 bg-white border border-slate-300 rounded-lg shadow text-xs text-slate-700">
              Carregando os 853 municípios...
            </div>
          )}
          {malha && !erroMalha && (carregandoIndice || carregandoVotos) && (
            <div role="status" className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 bg-white border border-blue-300 rounded-lg shadow text-xs font-semibold text-blue-800">
              {carregandoIndice ? 'Carregando a lista de itens...' : 'Carregando os votos por município...'}
            </div>
          )}
          {erroMalha && (
            <div className="absolute top-3 left-3 right-3 z-20 p-3 bg-rose-50 border border-rose-200 rounded-lg shadow text-xs text-rose-700">
              {erroMalha}
            </div>
          )}

          {itensMarcados.length > 0 && (
            <div className="absolute bottom-6 left-3 z-20 bg-white/95 border border-slate-200 rounded-xl p-2.5 shadow-lg text-[11px] text-slate-700 max-w-[15rem]">
              {modoEfetivo === 'lider' && itensMarcados.length > 1 ? (
                <div className="space-y-1">
                  <div className="font-bold text-slate-900">Quem teve mais votos</div>
                  {itensMarcados.map((i) => (
                    <div key={i.id} className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: corValida(i.cor) }} />
                      <span className="truncate">{i.nome}</span>
                    </div>
                  ))}
                </div>
              ) : forma === 'circulos' ? (
                <div>
                  <div className="font-bold text-slate-900">Tamanho do círculo = {modoEfetivo === 'percentual' ? 'percentual dos válidos' : 'votos'}</div>
                  <div>{modoEfetivo === 'percentual' ? 'Do item marcado em cada município.' : 'Soma dos itens marcados em cada município.'}</div>
                </div>
              ) : modoEfetivo === 'percentual' ? (
                <div className="space-y-1">
                  <div className="font-bold text-slate-900">% dos votos válidos do município</div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm border border-slate-300" style={{ backgroundColor: COR_SEM_VOTO }} />
                    <span>sem voto</span>
                  </div>
                  {[0, ...limitesPct].map((inicio, k) => {
                    const fim = limitesPct[k];
                    return (
                      <div key={k} className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: corPorValor(Math.max(0.001, inicio), limitesPct, rampa) }} />
                        <span className="font-mono">
                          {k === 0 ? 'até ' : `${fmtFaixa(inicio)} `}
                          {fim !== undefined ? (k === 0 ? fmtFaixa(fim) : `a ${fmtFaixa(fim)}`) : 'ou mais'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="font-bold text-slate-900">Votos por município</div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm border border-slate-300" style={{ backgroundColor: COR_SEM_VOTO }} />
                    <span>sem voto</span>
                  </div>
                  {[0, ...limites].map((inicio, k) => {
                    const fim = limites[k];
                    return (
                      <div key={k} className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: corPorValor(Math.max(1, inicio), limites, rampa) }} />
                        <span className="font-mono">
                          {fmt(Math.max(1, inicio))}
                          {fim ? ` a ${fmt(fim - 1)}` : ' ou mais'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {linhaSelecionada && (
            <div className="absolute top-3 right-3 left-3 sm:left-auto sm:w-80 z-20 bg-white border border-slate-200 rounded-xl shadow-xl p-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-sm text-slate-900 break-words">{linhaSelecionada.nome}</div>
                  <div className="text-slate-500">
                    {linhaSelecionada.total > 0 ? `${posicaoPorTotal.get(linhaSelecionada.cod)}º em votos dos itens marcados` : 'Sem votos dos itens marcados'}
                  </div>
                </div>
                <button
                  onClick={() => setMunicipioSel(null)}
                  className="flex items-center justify-center w-11 h-11 sm:w-9 sm:h-9 shrink-0 text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg cursor-pointer"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="mt-2 space-y-1">
                {itensMarcados.map((i) => {
                  const v = linhaSelecionada.votosPorItem[i.id] || 0;
                  const totalItem = totais.porItem[i.id] || 0;
                  return (
                    <div key={i.id} className="flex items-center justify-between gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: corValida(i.cor) }} />
                        <span className="truncate text-slate-900 font-semibold">{i.nome}</span>
                      </span>
                      <span className="font-mono tabular-nums text-slate-900 shrink-0 text-right">
                        <strong>{fmt(v)}</strong>
                        <span className="text-slate-500"> ({totalItem > 0 ? ((v / totalItem) * 100).toFixed(2).replace('.', ',') : '0,00'}% do total dele)</span>
                        {linhaSelecionada.pctPorItem[i.id] !== undefined && (
                          <span className="block text-slate-700">{fmtPct(linhaSelecionada.pctPorItem[i.id] as number)} dos votos válidos da cidade</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <section className={`${painel === 'tabela' ? 'flex' : 'hidden'} ${direitaAberta ? 'lg:flex' : 'lg:hidden'} flex-col w-full ${tabelaAberta ? 'lg:w-[26rem]' : 'lg:w-64'} shrink-0 border-l border-slate-200 overflow-hidden`}>
          <div className="shrink-0 p-2 flex items-center gap-2 border-b border-slate-200">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar município..."
                className="w-full h-10 pl-8 pr-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {tabelaAberta && (
              <button type="button" onClick={() => { setVerTodos(false); setBusca(''); }} className="h-10 px-3 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer" title="Recolher a lista">Recolher</button>
            )}
          </div>
          {tabelaAberta ? (
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-100 text-slate-700 border-b border-slate-300 select-none">
                  <tr>
                    <th className="p-2 text-left font-semibold">#</th>
                    <th className="p-2 text-left font-semibold cursor-pointer" onClick={() => ordenarPor('nome')}>
                      Município{seta('nome')}
                    </th>
                    {itensMarcados.map((i) => (
                      <th key={i.id} className="p-2 text-right font-semibold cursor-pointer" onClick={() => ordenarPor(i.id)} title={`${i.nome} (${i.numero})`}>
                        <span className="inline-flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: corValida(i.cor) }} />
                          {i.numero}
                          {seta(i.id)}
                        </span>
                      </th>
                    ))}
                    {itemComPct && (
                      <th className="p-2 text-right font-semibold cursor-pointer" onClick={() => ordenarPor('pct')} title="Percentual dos votos válidos do município">
                        % válidos{seta('pct')}
                      </th>
                    )}
                    {itensMarcados.length !== 1 && (
                      <th className="p-2 text-right font-semibold cursor-pointer" onClick={() => ordenarPor('total')}>
                        Total{seta('total')}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {linhasTabela.map((l) => (
                    <tr
                      key={l.cod}
                      onClick={() => irParaMunicipio(l.cod)}
                      className={`cursor-pointer hover:bg-slate-100 ${municipioSel === l.cod ? 'bg-blue-50' : ''}`}
                    >
                      <td className="p-2 text-slate-500 font-mono">{l.total > 0 ? posicaoPorTotal.get(l.cod) : ''}</td>
                      <td className="p-2 font-semibold text-slate-900">{l.nome}</td>
                      {itensMarcados.map((i) => (
                        <td key={i.id} className="p-2 text-right font-mono tabular-nums text-slate-900">
                          {fmt(l.votosPorItem[i.id] || 0)}
                        </td>
                      ))}
                      {itemComPct && (
                        <td className="p-2 text-right font-mono tabular-nums text-slate-700">
                          {l.pctPorItem[itemComPct] !== undefined ? fmtPct(l.pctPorItem[itemComPct] as number) : '-'}
                        </td>
                      )}
                      {itensMarcados.length !== 1 && (
                        <td className="p-2 text-right font-mono tabular-nums font-bold text-slate-900">{fmt(l.total)}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
                {itensMarcados.length > 0 && !busca.trim() && (
                  <tfoot className="sticky bottom-0 bg-slate-100 border-t border-slate-300 font-bold text-slate-900">
                    <tr>
                      <td className="p-2" />
                      <td className="p-2">Minas Gerais</td>
                      {itensMarcados.map((i) => (
                        <td key={i.id} className="p-2 text-right font-mono tabular-nums">
                          {fmt(totais.porItem[i.id] || 0)}
                        </td>
                      ))}
                      {itemComPct && <td className="p-2" />}
                      {itensMarcados.length !== 1 && <td className="p-2 text-right font-mono tabular-nums">{fmt(totais.geral)}</td>}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          ) : (
            <div className="flex-1 p-4 text-xs text-slate-600 space-y-3">
              <p>Digite o nome de um município para ver os votos dele.</p>
              <button type="button" onClick={() => setVerTodos(true)} className="w-full h-10 bg-white border border-slate-300 rounded-lg font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer">Ver todos os municípios</button>
            </div>
          )}
        </section>
      </div>

    </div>
  );
};
