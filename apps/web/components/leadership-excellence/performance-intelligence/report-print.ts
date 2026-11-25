/** Print a detached copy of the visible report, excluding the application shell. */
export function printIntelligenceReport(report: HTMLElement): void {
  const frame = document.createElement("iframe");
  frame.title = "Performance intelligence print view";
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:fixed;width:0;height:0;border:0;bottom:0;right:0";
  document.body.appendChild(frame);
  const printDocument = frame.contentDocument;
  const printWindow = frame.contentWindow;
  if (!printDocument || !printWindow) {
    frame.remove();
    throw new Error("The print view could not be opened. Please try again.");
  }
  printDocument.title = "Performance intelligence report";
  const style = printDocument.createElement("style");
  style.textContent = `
    @page { size: landscape; margin: 12mm; }
    body { color: #172033; font: 10pt/1.45 Arial, sans-serif; }
    h1 { font-size: 22pt; margin: 0 0 5pt; }
    h2 { font-size: 15pt; margin: 16pt 0 7pt; }
    h3 { font-size: 12pt; }
    p { margin: 5pt 0 9pt; }
    section { margin: 12pt 0; }
    table { border-collapse: collapse; width: 100%; font-size: 9pt; }
    th, td { border-bottom: 1px solid #cbd5e1; padding: 6pt; text-align: left; vertical-align: top; }
    th { font-weight: 700; background: #f1f5f9; }
    thead { display: table-header-group; }
    tr, [data-report-metric] { break-inside: avoid; }
    a, button { color: inherit; font: inherit; text-decoration: none; border: 0; padding: 0; background: none; }
    button { text-align: left; }
    svg, [data-print-hidden] { display: none !important; }
    [data-report-metrics] { display: flex; gap: 18pt; flex-wrap: wrap; }
    [data-report-metric] { min-width: 85pt; border: 1px solid #cbd5e1; padding: 9pt; }
    [data-report-metric] strong { display: block; font-size: 18pt; }
    [data-report-filters] { border-bottom: 1px solid #cbd5e1; padding-bottom: 9pt; }
    [data-report-badge] { display: inline-block; padding: 1pt 3pt; border: 1px solid #cbd5e1; margin: 1pt; font-size: 8pt; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
  `;
  printDocument.head.appendChild(style);
  printDocument.body.appendChild(report.cloneNode(true));
  const cleanup = () => frame.remove();
  printWindow.addEventListener("afterprint", cleanup, { once: true });
  // Retain the frame until the browser has consumed its print document.
  window.setTimeout(cleanup, 120_000);
  printWindow.focus();
  printWindow.print();
}
