import { formatDate, formatDateTime, plainAmount, todayISO } from './format';

/**
 * Both exporters consume the same report shape, so a PDF and an Excel file of
 * the same report always contain the same numbers:
 *
 *   { title, subtitle, filenameBase, businessName, summary: [[label, value]], columns, rows }
 *   columns: [{ header, key, kind: 'text'|'money'|'number', width, align }]
 */

const DEFAULT_BUSINESS_NAME = 'DRL Lending Cooperative';
const MARGIN = 40;
const INK = [43, 45, 54];
const MUTED = [103, 104, 121];
const FAINT = [150, 153, 166];
const BRAND = [0, 115, 234];

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

// Manila, not UTC: an export run before 8am would otherwise be filed under
// yesterday's date while every date inside it reads today.
function stamp() {
  return todayISO();
}

function slug(text) {
  return (
    String(text ?? '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_]+/g, '-')
      .slice(0, 40) || 'member'
  );
}

function cellText(row, column) {
  const value = row[column.key];
  if (value === null || value === undefined || value === '') return '';
  if (column.kind === 'money') return plainAmount(value);
  if (column.kind === 'number') return String(value);
  return String(value);
}

/** autoTable applies columnStyles to body cells only; this lines headers and totals up with them. */
function alignWithBody(aligns, extra) {
  return (data) => {
    if ((data.section === 'head' || data.section === 'foot') && aligns[data.column.index]) {
      data.cell.styles.halign = aligns[data.column.index];
    }
    extra?.(data);
  };
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

async function loadPdf(orientation = 'portrait') {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const autoTable = autoTableModule.default ?? autoTableModule;
  const doc = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
  return { doc, autoTable };
}

/** Business name, title and subtitle on the left; generation time on the right. Returns the next y. */
function drawHeader(doc, { businessName, title, subtitle }) {
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...INK);
  doc.text(businessName || DEFAULT_BUSINESS_NAME, MARGIN, 46);

  doc.setFontSize(12);
  doc.text(title, MARGIN, 66);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  if (subtitle) doc.text(subtitle, MARGIN, 82);
  doc.text(`Generated ${formatDateTime(new Date())}`, pageWidth - MARGIN, 46, { align: 'right' });
  doc.setTextColor(...INK);

  return 100;
}

/** "Page x of y" on every page, drawn last so the total is known. */
function numberPages(doc, footerLeft) {
  const total = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...FAINT);
    const left = typeof footerLeft === 'function' ? footerLeft(page) : footerLeft;
    if (left) doc.text(left, MARGIN, pageHeight - 18);
    doc.text(`Page ${page} of ${total}`, pageWidth - MARGIN, pageHeight - 18, { align: 'right' });
  }
  doc.setTextColor(...INK);
}

export async function exportReportToPdf(report) {
  const { doc, autoTable } = await loadPdf(report.columns.length > 6 ? 'landscape' : 'portrait');
  let cursor = drawHeader(doc, report);

  if (report.summary?.length) {
    autoTable(doc, {
      startY: cursor,
      margin: { left: MARGIN, right: MARGIN },
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
    margin: { left: MARGIN, right: MARGIN },
    head: [report.columns.map((column) => column.header)],
    body: report.rows.map((row) => report.columns.map((column) => cellText(row, column))),
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold', fontSize: 8 },
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
    didParseCell: alignWithBody(
      report.columns.map(
        (column) => column.align ?? (column.kind === 'money' || column.kind === 'number' ? 'right' : 'left')
      )
    ),
  });

  numberPages(doc);
  download(doc.output('blob'), `${report.filenameBase}-${stamp()}.pdf`);
}

/* ------------------------------------------------------------ route sheet */

const NO_TODA = 'No TODA on file';

/**
 * A paper sheet for the collector: one section per TODA, each starting on a
 * fresh page, with an empty "Collected" column to fill in by hand and a
 * turn-in line at the bottom to settle against the cash count later.
 */
export async function exportRouteSheetPdf({ rows, businessName }) {
  const { doc, autoTable } = await loadPdf('portrait');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const today = todayISO();

  const groups = new Map();
  for (const row of rows) {
    const key = row.toda?.trim() || NO_TODA;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const totalDaily = rows.reduce((sum, row) => sum + Number(row.daily_due || 0), 0);
  const pageToda = new Map();

  let first = true;
  for (const [toda, members] of groups) {
    if (!first) doc.addPage();
    first = false;

    let cursor = drawHeader(doc, {
      businessName,
      title: 'Collection route sheet',
      subtitle: `${formatDate(today, { weekday: 'long' })} · ${rows.length} members across ${groups.size} TODA · PHP ${plainAmount(totalDaily)} due in total`,
    });

    const groupDaily = members.reduce((sum, row) => sum + Number(row.daily_due || 0), 0);
    const groupBehind = members.reduce((sum, row) => sum + Number(row.arrears || 0), 0);

    doc.setFillColor(230, 241, 254);
    doc.roundedRect(MARGIN, cursor, pageWidth - MARGIN * 2, 34, 6, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(0, 69, 127);
    doc.text(toda, MARGIN + 12, cursor + 21);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(
      `${members.length} ${members.length === 1 ? 'member' : 'members'} · PHP ${plainAmount(groupDaily)} due today`,
      pageWidth - MARGIN - 12,
      cursor + 21,
      { align: 'right' }
    );
    doc.setTextColor(...INK);
    cursor += 46;

    const startPage = doc.getNumberOfPages();

    autoTable(doc, {
      startY: cursor,
      margin: { left: MARGIN, right: MARGIN, bottom: 40 },
      head: [['#', 'Member', 'Contact', 'Daily due', 'Behind', 'Balance', 'Collected']],
      body: members.map((row, index) => [
        String(index + 1),
        row.is_overdue ? `${row.member_name} (past due)` : row.member_name,
        row.contact_number || '',
        plainAmount(row.daily_due),
        Number(row.arrears) > 0 ? plainAmount(row.arrears) : '-',
        plainAmount(row.balance),
        '',
      ]),
      foot: [
        [
          '',
          'Total',
          '',
          plainAmount(groupDaily),
          groupBehind > 0 ? plainAmount(groupBehind) : '-',
          plainAmount(members.reduce((sum, row) => sum + Number(row.balance || 0), 0)),
          '',
        ],
      ],
      showFoot: 'lastPage',
      styles: { fontSize: 9, cellPadding: 5, minCellHeight: 24, valign: 'middle', lineColor: [225, 228, 237] },
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
      footStyles: { fillColor: [245, 246, 250], textColor: INK, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 251, 253] },
      theme: 'grid',
      columnStyles: {
        0: { cellWidth: 22, halign: 'right', textColor: FAINT },
        1: { cellWidth: 'auto', fontStyle: 'bold' },
        2: { cellWidth: 82 },
        3: { cellWidth: 60, halign: 'right' },
        4: { cellWidth: 56, halign: 'right' },
        5: { cellWidth: 62, halign: 'right' },
        6: { cellWidth: 78 },
      },
      didParseCell: alignWithBody({ 0: 'right', 3: 'right', 4: 'right', 5: 'right' }, (data) => {
        if (data.section === 'body' && data.column.index === 4 && data.cell.raw !== '-') {
          data.cell.styles.textColor = [179, 45, 66];
          data.cell.styles.fontStyle = 'bold';
        }
      }),
    });

    for (let page = startPage; page <= doc.getNumberOfPages(); page += 1) pageToda.set(page, toda);

    let signY = doc.lastAutoTable.finalY + 34;
    if (signY > pageHeight - 70) {
      doc.addPage();
      pageToda.set(doc.getNumberOfPages(), toda);
      signY = 80;
    }
    doc.setDrawColor(...FAINT);
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    const colWidth = (pageWidth - MARGIN * 2) / 2;
    [
      ['Collector', MARGIN],
      ['Total turned in (PHP)', MARGIN + colWidth + 10],
    ].forEach(([label, x]) => {
      doc.line(x, signY, x + colWidth - 20, signY);
      doc.text(label, x, signY + 13);
    });
    doc.setTextColor(...INK);
  }

  numberPages(doc, (page) => pageToda.get(page) ?? '');
  download(doc.output('blob'), `drl-route-sheet-${stamp()}.pdf`);
}

/* -------------------------------------------------------------- statement */

const STATUS_TEXT = {
  active: 'Active',
  completed: 'Fully paid',
  written_off: 'Written off',
};

/**
 * What a member takes home: the terms they agreed to, where the balance stands
 * today, and every payment on record. Internal payment notes are left off on
 * purpose — they are written for the admin, not the borrower.
 */
export async function exportLoanStatementPdf({ loan, payments, businessName }) {
  const { doc, autoTable } = await loadPdf('portrait');
  const pageWidth = doc.internal.pageSize.getWidth();
  const today = todayISO();
  const contentWidth = pageWidth - MARGIN * 2;

  let cursor = drawHeader(doc, {
    businessName,
    title: 'Loan statement',
    subtitle: `Balance as of ${formatDate(today, { weekday: 'long' })}`,
  });

  // Member block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(loan.member_name, MARGIN, cursor + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  const contactLine = [loan.contact_number, loan.toda].filter(Boolean).join(' · ');
  if (contactLine) doc.text(contactLine, MARGIN, cursor + 21);

  const status = loan.is_overdue ? 'Past due' : (STATUS_TEXT[loan.status] ?? loan.status);
  const statusColor =
    loan.is_overdue ? [226, 68, 92] : loan.status === 'completed' ? [0, 184, 116] : BRAND;
  doc.setFont('helvetica', 'bold');
  const statusWidth = doc.getTextWidth(status) + 20;
  doc.setFillColor(...statusColor);
  doc.roundedRect(pageWidth - MARGIN - statusWidth, cursor - 8, statusWidth, 20, 10, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text(status, pageWidth - MARGIN - statusWidth / 2, cursor + 5, { align: 'center' });
  doc.setTextColor(...INK);
  cursor += 40;

  // Headline balance. Once nothing is owed, a daily payment figure means nothing;
  // the date it was settled does.
  const balance = Number(loan.balance);
  const behind = Number(loan.arrears) > 0;
  const thirdTile =
    balance <= 0
      ? ['LAST PAYMENT', loan.last_payment_date ? formatDate(loan.last_payment_date) : '-', INK]
      : behind
        ? ['BEHIND SCHEDULE', `PHP ${plainAmount(loan.arrears)}`, [153, 97, 13]]
        : ['DAILY PAYMENT', `PHP ${plainAmount(loan.daily_due)}`, BRAND];
  doc.setFillColor(245, 246, 250);
  doc.roundedRect(MARGIN, cursor, contentWidth, 64, 8, 8, 'F');
  const third = contentWidth / 3;
  [
    ['PAID SO FAR', `PHP ${plainAmount(loan.paid_total)}`, [0, 122, 77]],
    [
      balance > 0 ? 'TO PAY OFF TODAY' : 'BALANCE',
      `PHP ${plainAmount(balance)}`,
      balance > 0 ? [179, 45, 66] : [0, 122, 77],
    ],
    thirdTile,
  ].forEach(([label, value, color], index) => {
    const x = MARGIN + 14 + third * index;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...FAINT);
    doc.text(label, x, cursor + 22);
    doc.setFontSize(14);
    doc.setTextColor(...color);
    doc.text(value, x, cursor + 44);
  });
  doc.setTextColor(...INK);
  cursor += 84;

  // Terms
  const terms = [
    ['Amount released', `PHP ${plainAmount(loan.principal)}`],
    ['Interest', `${loan.interest_rate}% flat · PHP ${plainAmount(loan.interest_amount)}`],
    ...(loan.penalty_applied ? [['Late penalty', `PHP ${plainAmount(loan.penalty_amount)}`]] : []),
    ['Total payable', `PHP ${plainAmount(loan.total_obligation)}`],
    ['Term', `${loan.term_days} days · PHP ${plainAmount(loan.daily_due)} a day`],
    ['Released', formatDate(loan.start_date)],
    ['Due date', formatDate(loan.maturity_date)],
    ['Payments made', String(loan.payments_count ?? payments.length)],
  ];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Loan terms', MARGIN, cursor);
  autoTable(doc, {
    startY: cursor + 8,
    margin: { left: MARGIN, right: MARGIN },
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: { top: 4, bottom: 4, left: 0, right: 0 } },
    columnStyles: {
      0: { textColor: MUTED, cellWidth: 150 },
      1: { fontStyle: 'bold', halign: 'right' },
    },
    body: terms,
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 1) {
        doc.setDrawColor(238, 240, 246);
        doc.line(MARGIN, data.cell.y + data.cell.height, pageWidth - MARGIN, data.cell.y + data.cell.height);
      }
    },
  });
  cursor = doc.lastAutoTable.finalY + 26;

  // Payments
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Payment history', MARGIN, cursor);

  const ordered = [...payments].sort(
    (a, b) =>
      a.payment_date.localeCompare(b.payment_date) ||
      String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
  );

  if (ordered.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text('No payments recorded yet.', MARGIN, cursor + 18);
    doc.setTextColor(...INK);
    cursor += 30;
  } else {
    const sum = (key) => ordered.reduce((total, row) => total + Number(row[key] || 0), 0);
    autoTable(doc, {
      startY: cursor + 8,
      margin: { left: MARGIN, right: MARGIN, bottom: 50 },
      head: [['#', 'Date', 'Amount paid', 'To principal', 'To interest', 'To penalty']],
      body: ordered.map((row, index) => [
        String(index + 1),
        formatDate(row.payment_date),
        plainAmount(row.amount),
        plainAmount(row.principal_portion),
        plainAmount(row.interest_portion),
        Number(row.penalty_portion) > 0 ? plainAmount(row.penalty_portion) : '-',
      ]),
      foot: [
        [
          '',
          'Total',
          plainAmount(sum('amount')),
          plainAmount(sum('principal_portion')),
          plainAmount(sum('interest_portion')),
          sum('penalty_portion') > 0 ? plainAmount(sum('penalty_portion')) : '-',
        ],
      ],
      showFoot: 'lastPage',
      styles: { fontSize: 8.5, cellPadding: 5 },
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold', fontSize: 8 },
      footStyles: { fillColor: [245, 246, 250], textColor: INK, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 251, 253] },
      columnStyles: {
        0: { cellWidth: 24, halign: 'right', textColor: FAINT },
        2: { halign: 'right', fontStyle: 'bold' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
      },
      didParseCell: alignWithBody({ 0: 'right', 2: 'right', 3: 'right', 4: 'right', 5: 'right' }),
    });
    cursor = doc.lastAutoTable.finalY + 24;
  }

  if (cursor > doc.internal.pageSize.getHeight() - 70) {
    doc.addPage();
    cursor = 60;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(
    doc.splitTextToSize(
      'Payments recorded after this statement was generated are not included. Please keep this copy for your records and bring it if you have a question about your balance.',
      contentWidth
    ),
    MARGIN,
    cursor
  );
  doc.setTextColor(...INK);

  numberPages(doc, loan.member_name);
  download(doc.output('blob'), `drl-statement-${slug(loan.member_name)}-${stamp()}.pdf`);
}
