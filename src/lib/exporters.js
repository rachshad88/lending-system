import { plainAmount } from './format';

/**
 * Both exporters consume the same report shape, so a PDF and an Excel file of
 * the same report always contain the same numbers:
 *
 *   { title, subtitle, filenameBase, summary: [[label, value]], columns, rows }
 *   columns: [{ header, key, kind: 'text'|'money'|'number', width, align }]
 */

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

function cellText(row, column) {
  const value = row[column.key];
  if (value === null || value === undefined || value === '') return '';
  if (column.kind === 'money') return plainAmount(value);
  if (column.kind === 'number') return String(value);
  return String(value);
}

/* -------------------------------------------------------------------- xlsx */

export async function exportReportToExcel(report) {
  const writeXlsxFile = (await import('write-excel-file/browser')).default;

  const headerRow = report.columns.map((column) => ({
    value: column.header,
    fontWeight: 'bold',
    backgroundColor: '#E6F1FE',
    textColor: '#00457F',
    align: column.align ?? (column.kind === 'money' || column.kind === 'number' ? 'right' : 'left'),
  }));

  const bodyRows = report.rows.map((row) =>
    report.columns.map((column) => {
      const raw = row[column.key];
      if (column.kind === 'money' || column.kind === 'number') {
        return {
          value: raw === null || raw === undefined || raw === '' ? null : Number(raw),
          type: Number,
          format: column.kind === 'money' ? '#,##0.00' : '#,##0',
          align: 'right',
        };
      }
      return { value: raw === null || raw === undefined ? '' : String(raw), type: String };
    })
  );

  const dataSheet = {
    sheet: 'Data',
    data: [headerRow, ...bodyRows],
    columns: report.columns.map((column) => ({ width: column.width ?? 18 })),
    stickyRowsCount: 1,
  };

  const sheets = [dataSheet];

  if (report.summary?.length) {
    sheets.unshift({
      sheet: 'Summary',
      data: [
        [{ value: report.title, fontWeight: 'bold', fontSize: 14 }],
        [{ value: report.subtitle ?? '', textColor: '#676879' }],
        [],
        ...report.summary.map(([label, value]) => [
          { value: label, fontWeight: 'bold' },
          { value: String(value) },
        ]),
      ],
      columns: [{ width: 34 }, { width: 26 }],
    });
  }

  const blob = await writeXlsxFile(sheets).toBlob();
  download(blob, `${report.filenameBase}-${stamp()}.xlsx`);
}

/* --------------------------------------------------------------------- pdf */

export async function exportReportToPdf(report) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const autoTable = autoTableModule.default ?? autoTableModule;

  const landscape = report.columns.length > 6;
  const doc = new jsPDF({
    orientation: landscape ? 'landscape' : 'portrait',
    unit: 'pt',
    format: 'a4',
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('DRL Lending Cooperative', margin, 46);

  doc.setFontSize(12);
  doc.text(report.title, margin, 66);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(103, 104, 121);
  if (report.subtitle) doc.text(report.subtitle, margin, 82);
  doc.text(`Generated ${new Date().toLocaleString('en-PH')}`, pageWidth - margin, 46, {
    align: 'right',
  });
  doc.setTextColor(43, 45, 54);

  let cursor = 100;

  if (report.summary?.length) {
    autoTable(doc, {
      startY: cursor,
      margin: { left: margin, right: margin },
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 4 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 190 },
        1: { halign: 'right', fontStyle: 'bold' },
      },
      body: report.summary.map(([label, value]) => [label, String(value)]),
      tableWidth: 360,
    });
    cursor = doc.lastAutoTable.finalY + 22;
  }

  autoTable(doc, {
    startY: cursor,
    margin: { left: margin, right: margin },
    head: [report.columns.map((column) => column.header)],
    body: report.rows.map((row) => report.columns.map((column) => cellText(row, column))),
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: [0, 115, 234], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 250, 253] },
    columnStyles: Object.fromEntries(
      report.columns.map((column, index) => [
        index,
        {
          halign:
            column.align ?? (column.kind === 'money' || column.kind === 'number' ? 'right' : 'left'),
        },
      ])
    ),
    didDrawPage: () => {
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(150, 153, 166);
      doc.text(
        `Page ${doc.internal.getCurrentPageInfo().pageNumber}`,
        pageWidth - margin,
        pageHeight - 18,
        { align: 'right' }
      );
      doc.setTextColor(43, 45, 54);
    },
  });

  download(doc.output('blob'), `${report.filenameBase}-${stamp()}.pdf`);
}
