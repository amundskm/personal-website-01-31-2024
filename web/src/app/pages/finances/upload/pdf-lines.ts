import type { TextItem } from 'pdfjs-dist/types/src/display/api';

/**
 * Extracts a PDF's text as lines of cells, top to bottom, left to right.
 * Runs entirely in the browser; the file is never uploaded.
 */
export async function pdfLines(data: ArrayBuffer): Promise<string[][]> {
  // The legacy build supports browsers without the newest JS features. Running
  // the worker code on the main thread avoids serving a separate worker file;
  // a statement is only a few pages.
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.mjs'),
  ]);
  (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;

  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  const lines: string[][] = [];
  try {
    const doc = await task.promise;
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const { items } = await page.getTextContent();
      lines.push(...groupIntoLines(items.filter((item): item is TextItem => 'str' in item)));
    }
  } finally {
    await task.destroy();
  }
  return lines;
}

/** Text items on the same baseline form a line; each item is a cell. */
export function groupIntoLines(items: Pick<TextItem, 'str' | 'transform'>[]): string[][] {
  const rows = new Map<number, { x: number; text: string }[]>();
  for (const item of items) {
    if (!item.str.trim()) continue;
    const y = Math.round(item.transform[5]);
    const row = rows.get(y) ?? [];
    row.push({ x: item.transform[4], text: item.str.trim() });
    rows.set(y, row);
  }
  return [...rows]
    .sort(([a], [b]) => b - a)
    .map(([, row]) => row.sort((a, b) => a.x - b.x).map((cell) => cell.text));
}
