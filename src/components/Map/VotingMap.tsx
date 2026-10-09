import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CandidatoInfo, LocalAgrupado, ModoVisualizacao } from '../../types/election';
import { Crosshair, Maximize2, Upload, Expand, Shrink, Layers } from 'lucide-react';

interface VotingMapProps {
  locais: LocalAgrupado[];
  selectedLocalKey: string | null;
  onSelectLocal: (localKey: string) => void;
  candidatosSelecionados: CandidatoInfo[];
  modoVisualizacao: ModoVisualizacao;
  destaqueSecao?: string;
  hasAnyPublishedData: boolean;
}

const esc = (valor: unknown): string =>
  String(valor ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const corSegura = (cor: unknown): string =>
  typeof cor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(cor) ? cor : '#2563eb';

const COR_CRESCEU = '#2a78d6';
const COR_CAIU = '#eb6834';
const COR_NEUTRA = '#94a3b8';
const ZOOM_DOS_NUMEROS = 14;
const comSinal = (n: number): string => `${n > 0 ? '+' : ''}${n.toLocaleString('pt-BR')}`;

export const VotingMap: React.FC<VotingMapProps> = ({
  locais,
  selectedLocalKey,
  onSelectLocal,
  candidatosSelecionados,
  modoVisualizacao,
  destaqueSecao,
  hasAnyPublishedData,
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
  const [camada, setCamada] = useState<'escolas' | 'calor' | 'bairros' | 'regionais'>('escolas');
  const [limites, setLimites] = useState<any[] | null>(null);
  useEffect(() => {
    if ((camada !== 'bairros' && camada !== 'regionais') || limites) return;
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

      {!hasAnyPublishedData && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-white/60 backdrop-blur-xs pointer-events-none">
          <div className="bg-slate-100 border border-slate-300 p-6 rounded-2xl shadow-2xl max-w-sm text-center space-y-3 pointer-events-auto">
            <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 flex items-center justify-center mx-auto">
              <Upload className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Nenhum candidato disponível</h3>
            <p className="text-xs text-slate-700 leading-relaxed">
              Não há candidatos liberados para o seu usuário. Fale com o responsável pelo mapa.
            </p>
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
