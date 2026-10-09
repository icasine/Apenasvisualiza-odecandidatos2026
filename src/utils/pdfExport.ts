
import { jsPDF } from 'jspdf';
import { CandidatoInfo, LocalAgrupado } from '../types/election';

export function exportLocalToPDF(
  local: LocalAgrupado,
  candidatosSelecionados: CandidatoInfo[]
): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = 16;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('MAPA ELEITORAL DE CONTAGEM / MG', margin, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  const anoStr = Array.from(new Set(candidatosSelecionados.map((c) => c.ano))).join(', ') || 'ELEIÇÃO';
  doc.text(`BOLETIM DE LOCAL DE VOTAÇÃO · ${anoStr}`, margin, 19);

  const dataEmissao = new Date().toLocaleString('pt-BR');
  doc.setFontSize(8);
  doc.text(`Emissão: ${dataEmissao}`, pageWidth - margin, 19, { align: 'right' });

  y = 36;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 26, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(local.nome_local, margin + 4, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Zona Eleitoral: ${local.zona}   |   Local nº: ${local.local_num}   |   Bairro: ${local.bairro}`,
    margin + 4,
    y + 15
  );
  doc.text(`Endereço: ${local.endereco || 'Não informado'}`, margin + 4, y + 21);

  y += 32;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text('1. CONSOLIDAÇÃO DO LOCAL (SOMA DAS SEÇÕES)', margin, y);
  y += 5;

  const colWidth = (pageWidth - margin * 2) / 3;
  const metrics = [
    { label: 'Eleitores Aptos', val: local.totalEleitoresAptos.toLocaleString('pt-BR') },
    { label: 'Total de Votos Marcados', val: local.totalVotosMarcados.toLocaleString('pt-BR') },
    {
      label: '% sobre Eleitores',
      val: `${local.pctSobreEleitores.toFixed(2)}%`
    }
  ];

  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, pageWidth - margin * 2, 14, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, y + 14, pageWidth - margin, y + 14);

  metrics.forEach((m, idx) => {
    const xPos = margin + idx * colWidth + 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(m.label, xPos, y + 5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(m.val, xPos, y + 11);
  });

  y += 20;

  if (candidatosSelecionados.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    doc.text('2. VOTOS POR CANDIDATO NO LOCAL', margin, y);
    y += 5;

    candidatosSelecionados.forEach((cand) => {
      const semCorrespondencia = (local.semCorrespondencia || []).includes(cand.id);
      const votosCand = local.votosPorCandidato[cand.id] || 0;
      const eleitoresDoAno = local.eleitoresPorAno?.[cand.ano] ?? local.totalEleitoresAptos;
      const pctCand = eleitoresDoAno > 0 ? (votosCand / eleitoresDoAno) * 100 : 0;

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, y, pageWidth - margin * 2, 10, 1, 1, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`${cand.nome} (${cand.numero}) - ${cand.cargo.toUpperCase()} ${cand.ano}`, margin + 4, y + 6.5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(2, 132, 199);
      doc.text(
        semCorrespondencia ? 'sem correspondência neste ano' : `${votosCand.toLocaleString('pt-BR')} votos (${pctCand.toFixed(2)}%)`,
        pageWidth - margin - 4,
        y + 6.5,
        { align: 'right' }
      );

      y += 12;
    });

    y += 3;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text(`3. DETALHAMENTO POR SEÇÃO ELEITORAL (${local.secoes.length} SEÇÕES)`, margin, y);
  y += 5;

  const sortedSecoes = [...local.secoes].sort((a, b) => a.secao.localeCompare(b.secao));

  const headers = ['Seção', 'Situação', 'Eleitores Aptos', ...candidatosSelecionados.map((c) => `${c.numero}`), 'Total Votos'];
  const baseColWidth = (pageWidth - margin * 2) / headers.length;

  doc.setFillColor(30, 41, 59);
  doc.rect(margin, y, pageWidth - margin * 2, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);

  let curX = margin;
  headers.forEach((h, i) => {
    const isRight = i >= 2;
    doc.text(h, isRight ? curX + baseColWidth - 2 : curX + 2, y + 4.8, { align: isRight ? 'right' : 'left' });
    curX += baseColWidth;
  });

  y += 7;

  sortedSecoes.forEach((sec, idx) => {
    if (y > pageHeight - 20) {
      doc.addPage();
      y = 16;
    }

    doc.setFillColor(idx % 2 === 0 ? 255 : 248, 250, 252);
    doc.rect(margin, y, pageWidth - margin * 2, 6.5, 'F');
    doc.setDrawColor(241, 245, 249);
    doc.line(margin, y + 6.5, pageWidth - margin, y + 6.5);

    const situacaoTexto = sec.isAgregada
      ? `Agregada à ${sec.secaoDestino || 'principal'}`
      : 'Normal';

    const candVotosValues = candidatosSelecionados.map((c) =>
      sec.isAgregada || sec.votosPorCandidato[c.id] === undefined ? '-' : String(sec.votosPorCandidato[c.id])
    );

    const rowData = [
      sec.secao,
      situacaoTexto,
      sec.isAgregada ? '-' : sec.aptos.toLocaleString('pt-BR'),
      ...candVotosValues,
      sec.isAgregada ? '-' : sec.votosTotalMarcados.toLocaleString('pt-BR')
    ];

    let rowX = margin;
    rowData.forEach((val, cIdx) => {
      const isRight = cIdx >= 2;
      if (sec.isAgregada && cIdx === 1) {
        doc.setTextColor(180, 83, 9);
      } else {
        doc.setTextColor(15, 23, 42);
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(val, isRight ? rowX + baseColWidth - 2 : rowX + 2, y + 4.5, { align: isRight ? 'right' : 'left' });
      rowX += baseColWidth;
    });

    y += 6.5;
  });

  y += 6;
  if (y > pageHeight - 16) {
    doc.addPage();
    y = 16;
  }
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('* Seções agregadas têm seus votos totalizados na seção principal para evitar dupla contagem.', margin, y);
  doc.text('Documento gerado através do aplicativo Mapa Eleitoral Contagem.', margin, y + 4);

  const safeName = local.nome_local.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  doc.save(`boletim_local_${local.zona}_${local.local_num}_${safeName}.pdf`);
}

export interface ColunaTabelaPDF {
  titulo: string;
  alinhar?: 'left' | 'right';
  peso?: number;
}

export interface LinhaTabelaPDF {
  celulas: string[];
  destaque?: boolean;
  recuo?: boolean;
}

export function exportTabelaToPDF(p: {
  titulo: string;
  subtitulo: string;
  colunas: ColunaTabelaPDF[];
  linhas: LinhaTabelaPDF[];
  observacoes?: string[];
  nomeArquivo: string;
}): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const larguraPagina = doc.internal.pageSize.getWidth();
  const alturaPagina = doc.internal.pageSize.getHeight();
  const margem = 10;
  const larguraUtil = larguraPagina - margem * 2;
  const somaPesos = p.colunas.reduce((acc, c) => acc + (c.peso || 1), 0);
  const larguras = p.colunas.map((c) => (larguraUtil * (c.peso || 1)) / somaPesos);
  const alturaLinha = 5.6;
  let y = 0;
  let pagina = 0;

  const caber = (texto: string, largura: number): string => {
    let t = String(texto ?? '');
    if (doc.getTextWidth(t) <= largura) return t;
    while (t.length > 1 && doc.getTextWidth(`${t}…`) > largura) t = t.slice(0, -1);
    return `${t}…`;
  };

  const cabecalho = () => {
    pagina++;
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, larguraPagina, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(caber(p.titulo, larguraUtil - 60), margem, 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(203, 213, 225);
    doc.text(caber(p.subtitulo, larguraUtil - 60), margem, 14);
    doc.text(`Emissão: ${new Date().toLocaleString('pt-BR')} · página ${pagina}`, larguraPagina - margem, 14, { align: 'right' });

    y = 23;
    doc.setFillColor(30, 41, 59);
    doc.rect(margem, y, larguraUtil, 6.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    let x = margem;
    p.colunas.forEach((c, i) => {
      const direita = c.alinhar === 'right';
      doc.text(caber(c.titulo, larguras[i] - 3), direita ? x + larguras[i] - 1.5 : x + 1.5, y + 4.4, { align: direita ? 'right' : 'left' });
      x += larguras[i];
    });
    y += 6.5;
  };

  cabecalho();

  p.linhas.forEach((linha, idx) => {
    if (y > alturaPagina - 14) {
      doc.addPage();
      cabecalho();
    }
    if (linha.destaque) doc.setFillColor(226, 232, 240);
    else if (linha.recuo) doc.setFillColor(248, 250, 252);
    else doc.setFillColor(idx % 2 === 0 ? 255 : 250, idx % 2 === 0 ? 255 : 251, idx % 2 === 0 ? 255 : 252);
    doc.rect(margem, y, larguraUtil, alturaLinha, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.line(margem, y + alturaLinha, margem + larguraUtil, y + alturaLinha);

    doc.setFont('helvetica', linha.destaque ? 'bold' : 'normal');
    doc.setFontSize(linha.recuo ? 6.8 : 7.4);
    doc.setTextColor(linha.recuo ? 71 : 15, linha.recuo ? 85 : 23, linha.recuo ? 105 : 42);
    let x = margem;
    p.colunas.forEach((c, i) => {
      const direita = c.alinhar === 'right';
      const recuo = linha.recuo && i === 0 ? 3 : 0;
      const texto = caber(linha.celulas[i] ?? '', larguras[i] - 3 - recuo);
      doc.text(texto, direita ? x + larguras[i] - 1.5 : x + 1.5 + recuo, y + 3.9, { align: direita ? 'right' : 'left' });
      x += larguras[i];
    });
    y += alturaLinha;
  });

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  [...(p.observacoes || []), 'Documento gerado pelo aplicativo Mapa Eleitoral Contagem.'].forEach((obs) => {
    if (y > alturaPagina - 8) {
      doc.addPage();
      cabecalho();
      y += 4;
    }
    doc.text(caber(obs, larguraUtil), margem, y);
    y += 3.6;
  });

  doc.save(p.nomeArquivo);
}
