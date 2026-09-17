const EXPORT_SCALE = 2;
const EXPORT_BACKGROUND = "#fbfcfb";

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function renderElement(element: HTMLElement): Promise<HTMLCanvasElement> {
  const { default: html2canvas } = await import("html2canvas");
  return html2canvas(element, {
    backgroundColor: EXPORT_BACKGROUND,
    scale: EXPORT_SCALE,
    useCORS: true,
    allowTaint: false,
    logging: false,
    imageTimeout: 15_000,
    ignoreElements: (candidate) => candidate instanceof HTMLElement && candidate.dataset.exportIgnore === "true",
  });
}

function canvasBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("EXPORT_IMAGE_EMPTY"));
    }, type);
  });
}

export async function exportElementAsPng(element: HTMLElement, filename: string): Promise<void> {
  const canvas = await renderElement(element);
  downloadBlob(await canvasBlob(canvas, "image/png"), filename.endsWith(".png") ? filename : `${filename}.png`);
}

export async function exportElementAsPdf(element: HTMLElement, filename: string): Promise<void> {
  const canvas = await renderElement(element);
  const image = canvas.toDataURL("image/png");
  const { jsPDF } = await import("jspdf");
  const orientation = canvas.width >= canvas.height ? "landscape" : "portrait";
  const pdf = new jsPDF({ orientation, unit: "pt", format: "a4", compress: true });
  const margin = 24;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const scale = Math.min((pageWidth - margin * 2) / canvas.width, (pageHeight - margin * 2) / canvas.height);
  const width = canvas.width * scale;
  const height = canvas.height * scale;
  pdf.addImage(image, "PNG", (pageWidth - width) / 2, (pageHeight - height) / 2, width, height, undefined, "FAST");
  pdf.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

export async function exportTableAsCsv(
  table: { columns: Array<{ key: string; label: string }>; records: unknown[] },
  filename: string,
): Promise<void> {
  const headers = table.columns.map((col) => `"${col.label.replace(/"/g, '""')}"`).join(",");
  const rows = table.records.map((record) => {
    const row = record as Record<string, unknown>;
    const metadata = (row.metadata as Record<string, unknown> | undefined) ?? {};
    return table.columns
      .map((col) => {
        const value = row[col.key] ?? metadata[col.key] ?? "";
        const strValue = typeof value === "object" ? JSON.stringify(value) : String(value);
        return `"${strValue.replace(/"/g, '""')}"`;
      })
      .join(",");
  });

  const csv = [headers, ...rows].join("\n");
  const bom = "﻿";
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8" });

  downloadBlob(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
}
