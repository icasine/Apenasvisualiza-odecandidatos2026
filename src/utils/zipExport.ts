
import JSZip from 'jszip';
import { IndiceData, LocalVotacao } from '../types/election';

export async function downloadDataZip(
  indice: IndiceData,
  locais: LocalVotacao[],
  arquivosExtras: Record<string, any>
): Promise<void> {
  const zip = new JSZip();
  const dataFolder = zip.folder('data');
  if (!dataFolder) throw new Error('Falha ao criar pasta data no ZIP');

  dataFolder.file('indice.json', JSON.stringify(indice, null, 2));
  dataFolder.file('locais.json', JSON.stringify(locais, null, 2));

  for (const [caminho, conteudo] of Object.entries(arquivosExtras)) {
    dataFolder.file(caminho, typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo, null, 2));
  }

  const content = await zip.generateAsync({ type: 'blob' });
  const blobUrl = URL.createObjectURL(content);

  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `dados_eleitorais_contagem_${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

export function exportArrayToCSV(filename: string, rows: Record<string, any>[]): void {
  if (rows.length === 0) return;

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(';'),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const val = row[header];
          if (val === null || val === undefined) return '';
          const str = String(val).replace(/"/g, '""');
          return str.includes(';') || str.includes('\n') || str.includes('"') ? `"${str}"` : str;
        })
        .join(';')
    )
  ];

  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
