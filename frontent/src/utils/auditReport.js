import { downloadCsv } from './adminHelpers';
import { AUDIT_CATEGORIES, SENSITIVE_AUDIT_ACTIONS } from './auditCategories';

// Audit reports as PDF and CSV, used by the PDF / CSV buttons on the Audit Logs page and by the
// Export Report box. The PDF is real text: it pages cleanly at any length and the text can be
// searched and copied. (Turning the page into one big picture fails once a report runs long.)

export const auditCategoryOf = (action) => AUDIT_CATEGORIES.find((category) => category.actions.includes(action));

// "All" plus one entry per category, with how many of the logs fall in each.
// activeId marks the one the report is about, e.g. 'queries', or 'all'.
export const categoryBreakdown = (logs, activeId = 'all') => {
  const counts = {};
  logs.forEach((log) => {
    const category = auditCategoryOf(log.action);
    if (category) counts[category.id] = (counts[category.id] || 0) + 1;
  });
  return [
    { label: 'All', count: logs.length, active: activeId === 'all' },
    ...AUDIT_CATEGORIES.map((category) => ({ label: category.label, count: counts[category.id] || 0, active: activeId === category.id })),
  ];
};

export const reportSlug = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

// e.g. "01 Nov 2026, 02:00 PM"
export const formatReportMoment = (date) => date
  .toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
  .replace(/\b(am|pm)\b/, (half) => half.toUpperCase());

export const downloadAuditCsv = (fileName, logs) => downloadCsv(
  fileName,
  ['Timestamp', 'User Name', 'User Email', 'Role', 'Connection', 'Category', 'Action', 'Details'],
  logs.map((log) => [
    new Date(log.createdAt).toLocaleString(),
    log.user?.name || 'Unknown',
    log.user?.email || 'N/A',
    log.user?.role || 'N/A',
    log.connection?.name || 'Global System',
    auditCategoryOf(log.action)?.label || 'Other',
    log.action,
    log.details || '',
  ])
);

const MARGIN = 12; // mm
const BODY_SIZE = 7.5; // pt
const LINE_HEIGHT = BODY_SIZE * 0.3528 * 1.3; // mm
const PAD = 1.8; // mm inside each cell
const MAX_DETAIL_LINES = 6;

const BRAND = [13, 148, 136];
const INK = [15, 23, 42];
const MUTED = [100, 116, 139];
const DANGER = [190, 18, 60];
const RULE = [226, 232, 240];
const STRIPE = [248, 250, 252];
const HEAD_FILL = [241, 245, 249];

const COLUMNS = [
  { label: 'DATE & TIME', width: 30 },
  { label: 'USER', width: 46 },
  { label: 'CONNECTION', width: 38 },
  { label: 'ACTION', width: 34 },
  { label: 'DETAILS', width: 125 },
];

// The built-in PDF fonts only cover Western European letters. Common symbols are swapped for
// plain ones, and anything else (emoji, other scripts) becomes "?" instead of broken glyphs.
const pdfText = (value) => String(value ?? '')
  .replace(/[‘’]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[–—−]/g, '-')
  .replace(/…/g, '...')
  .replace(/→/g, '->')
  .replace(/[^\t\n\r\x20-\x7E\xA0-\xFF]/g, '?');

const formatDate = (date) => date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const formatTime = (date) => date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

const cellsFor = (log) => {
  const when = new Date(log.createdAt);
  const action = log.action || 'ACTION';
  return [
    [{ text: formatDate(when) }, { text: formatTime(when), color: MUTED }],
    [{ text: log.user?.name || 'Unknown', bold: true }, { text: log.user?.email || '', color: MUTED }],
    [
      { text: log.connection?.name || 'System' },
      { text: log.connection ? String(log.connection.type || '').toUpperCase() : 'No connection', color: MUTED },
    ],
    [{ text: action.replace(/_/g, ' '), bold: true, color: SENSITIVE_AUDIT_ACTIONS.has(action) ? DANGER : INK }],
    [{ text: log.details || '', maxLines: MAX_DETAIL_LINES }],
  ];
};

// Each cell part becomes lines that fit the column. Long details are cut with "...".
const layoutCell = (doc, parts, width) => parts.flatMap((part) => {
  if (!part.text) return [];
  doc.setFont('helvetica', part.bold ? 'bold' : 'normal');
  let lines = doc.splitTextToSize(pdfText(part.text), width - PAD * 2);
  if (part.maxLines && lines.length > part.maxLines) {
    lines = lines.slice(0, part.maxLines);
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/.{0,3}$/, '')}...`;
  }
  return lines.map((line) => ({ line, bold: part.bold, color: part.color || INK }));
});

/**
 * Builds the report and returns the jsPDF document.
 * summary: [label, value] pairs shown under the title, e.g. ['Person', 'Rahul'].
 * breakdown: optional counts per category from categoryBreakdown(), shown as chips.
 */
export const buildAuditPdf = async ({ logs, title, summary, breakdown }) => {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const tableWidth = pageWidth - MARGIN * 2;
  const bottom = pageHeight - MARGIN - 5; // room for the footer
  const generatedAt = new Date();

  // Title block, first page only
  let y = MARGIN;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...BRAND);
  doc.text('ALLATONE DMS', MARGIN, y + 3);
  doc.setFontSize(17);
  doc.setTextColor(...INK);
  doc.text(pdfText(title), MARGIN, y + 11);
  y += 17;

  doc.setFontSize(8.5);
  const half = tableWidth / 2;
  summary.forEach(([label, value], index) => {
    const x = MARGIN + (index % 2) * half;
    const rowY = y + Math.floor(index / 2) * 5;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...INK);
    const labelText = `${label}:`;
    doc.text(labelText, x, rowY);
    const valueX = x + doc.getTextWidth(labelText) + 1.5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(doc.splitTextToSize(pdfText(value), half - (valueX - x) - 4)[0] || '', valueX, rowY);
  });
  y += Math.ceil(summary.length / 2) * 5;

  // Records by category, as a row of chips like the ones on the page
  if (breakdown?.length) {
    const chipHeight = 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text('RECORDS BY CATEGORY', MARGIN, y + 1);
    y += 3;
    let x = MARGIN;
    breakdown.forEach(({ label, count, active }) => {
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      const labelText = pdfText(label);
      const labelWidth = doc.getTextWidth(labelText);
      const countText = Number(count).toLocaleString('en-US');
      doc.setFont('helvetica', 'normal');
      const width = 3 + labelWidth + 2 + doc.getTextWidth(countText) + 3;
      if (x + width > pageWidth - MARGIN) {
        x = MARGIN;
        y += chipHeight + 2;
      }
      doc.setLineWidth(0.3);
      if (active) {
        doc.setFillColor(...BRAND);
        doc.setDrawColor(...BRAND);
        doc.roundedRect(x, y, width, chipHeight, 3, 3, 'FD');
      } else {
        doc.setDrawColor(...RULE);
        doc.roundedRect(x, y, width, chipHeight, 3, 3, 'S');
      }
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...(active ? [255, 255, 255] : INK));
      doc.text(labelText, x + 3, y + 4.1);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...(active ? [255, 255, 255] : MUTED));
      doc.text(countText, x + 3 + labelWidth + 2, y + 4.1);
      x += width + 2;
    });
    y += chipHeight + 4;
  }

  doc.setDrawColor(...BRAND);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, y, pageWidth - MARGIN, y);
  y += 4;

  const drawHeader = () => {
    const height = LINE_HEIGHT + PAD * 2;
    doc.setFillColor(...HEAD_FILL);
    doc.rect(MARGIN, y, tableWidth, height, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    let x = MARGIN;
    COLUMNS.forEach((column) => {
      doc.text(column.label, x + PAD, y + PAD + LINE_HEIGHT * 0.72);
      x += column.width;
    });
    y += height;
    doc.setFontSize(BODY_SIZE);
  };

  drawHeader();
  doc.setFontSize(BODY_SIZE);

  if (logs.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text('No records match these filters.', MARGIN + PAD, y + 6);
  }

  logs.forEach((log, rowIndex) => {
    doc.setFontSize(BODY_SIZE);
    const cells = cellsFor(log).map((parts, index) => layoutCell(doc, parts, COLUMNS[index].width));
    const height = Math.max(...cells.map((lines) => lines.length), 1) * LINE_HEIGHT + PAD * 2;

    if (y + height > bottom) {
      doc.addPage();
      y = MARGIN;
      drawHeader();
    }
    if (rowIndex % 2 === 1) {
      doc.setFillColor(...STRIPE);
      doc.rect(MARGIN, y, tableWidth, height, 'F');
    }

    let x = MARGIN;
    cells.forEach((lines, index) => {
      let lineY = y + PAD + LINE_HEIGHT * 0.72;
      lines.forEach(({ line, bold, color }) => {
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setTextColor(...color);
        doc.text(line, x + PAD, lineY);
        lineY += LINE_HEIGHT;
      });
      x += COLUMNS[index].width;
    });

    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y + height, pageWidth - MARGIN, y + height);
    y += height;
  });

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(pdfText(`Allatone DMS audit report - generated ${formatDate(generatedAt)}, ${formatTime(generatedAt)}`), MARGIN, pageHeight - MARGIN + 2);
    doc.text(`Page ${page} of ${pages}`, pageWidth - MARGIN, pageHeight - MARGIN + 2, { align: 'right' });
  }

  return doc;
};

export const downloadAuditPdf = async ({ fileName, ...report }) => {
  const doc = await buildAuditPdf(report);
  doc.save(fileName);
};
