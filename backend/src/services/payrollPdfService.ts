import PDFDocument from 'pdfkit';

export interface PayslipPdfData {
  id: string;
  employeeCode: string;
  fullName: string;
  designation: string;
  departmentName: string;
  locationName: string;
  pan?: string;
  uan?: string;
  bankAccount?: string;
  bankName?: string;
  bankIfsc?: string;
  periodStart: string | Date;
  periodEnd: string | Date;
  basicSalary: number;
  hra: number;
  allowances: number;
  earlyIncentive: number;
  attendanceIncentive: number;
  salesIncentive: number;
  overtime: number;
  bonus: number;
  deductions: number;
  pfDeduction: number;
  taxDeduction: number;
  lopDeduction: number;
  penalties: number;
  netPay: number;
  status: string;
  customSections?: Array<{
    title: string;
    items: Array<{ label: string; amount: number; type: 'earning' | 'deduction' | 'info' }>;
  }>;
  remarks?: string;
}

export interface PayrollSettingsData {
  companyName?: string;
  companyAddress?: string;
  signatoryName?: string;
  signatoryDesignation?: string;
  currencySymbol?: string;
}

function numberToWordsINR(amount: number): string {
  const num = Math.floor(amount);
  if (num === 0) return 'Zero Rupees Only';

  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertTwoDigits(n: number): string {
    if (n < 20) return units[n];
    return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + units[n % 10] : '');
  }

  function convertThreeDigits(n: number): string {
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    let res = '';
    if (hundred > 0) res += units[hundred] + ' Hundred';
    if (rest > 0) res += (res ? ' and ' : '') + convertTwoDigits(rest);
    return res;
  }

  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const remainder = num % 1000;

  let words = '';
  if (crore > 0) words += convertTwoDigits(crore) + ' Crore ';
  if (lakh > 0) words += convertTwoDigits(lakh) + ' Lakh ';
  if (thousand > 0) words += convertTwoDigits(thousand) + ' Thousand ';
  if (remainder > 0) words += convertThreeDigits(remainder);

  return words.trim() + ' Rupees Only';
}

export async function generatePayslipPdf(data: PayslipPdfData, settings?: PayrollSettingsData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 36, size: 'A4' });
      const buffers: Buffer[] = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const companyName = settings?.companyName || 'BSC Textiles Private Limited';
      const companyAddress = settings?.companyAddress || '#104 Silk Mill Road, Industrial Area, Belagavi, Karnataka – 590014\nGSTIN: 29AAACB1234F1Z5 | TAN: BLRB12345C';
      const signatory = settings?.signatoryName || 'Sunita Deshmukh';
      const signatoryRole = settings?.signatoryDesignation || 'Head of Human Resources & Statutory Labor Compliance';

      const formatCurrency = (val: number) => `INR ${Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      const pStart = new Date(data.periodStart).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      const pEnd = new Date(data.periodEnd).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      const payMonth = new Date(data.periodEnd).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

      // --- HEADER ---
      doc.rect(36, 36, 523, 70).fill('#0b1c30');
      doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold').text(companyName, 48, 48);
      doc.fillColor('#94a3b8').fontSize(8).font('Helvetica').text(companyAddress, 48, 68, { width: 340, lineGap: 2 });

      doc.fillColor('#60a5fa').fontSize(11).font('Helvetica-Bold').text('PAYSLIP / FORM T', 420, 48, { align: 'right', width: 125 });
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica').text(payMonth, 420, 64, { align: 'right', width: 125 });
      doc.fillColor(data.status === 'APPROVED' || data.status === 'FINALIZED' ? '#34d399' : '#fbbf24')
        .fontSize(8)
        .font('Helvetica-Bold')
        .text(`[ STATUS: ${data.status} ]`, 420, 80, { align: 'right', width: 125 });

      doc.y = 118;

      // --- EMPLOYEE PARTICULARS BOX ---
      doc.rect(36, doc.y, 523, 76).strokeColor('#cbd5e1').lineWidth(1).stroke();
      const metaY = doc.y + 8;

      // Col 1
      doc.fillColor('#64748b').fontSize(8).font('Helvetica').text('Employee Code:', 48, metaY);
      doc.fillColor('#0f172a').font('Helvetica-Bold').text(data.employeeCode, 120, metaY);
      doc.fillColor('#64748b').font('Helvetica').text('Employee Name:', 48, metaY + 14);
      doc.fillColor('#0f172a').font('Helvetica-Bold').text(data.fullName, 120, metaY + 14);
      doc.fillColor('#64748b').font('Helvetica').text('Designation:', 48, metaY + 28);
      doc.fillColor('#0f172a').font('Helvetica-Bold').text(data.designation, 120, metaY + 28);
      doc.fillColor('#64748b').font('Helvetica').text('Department:', 48, metaY + 42);
      doc.fillColor('#0f172a').font('Helvetica').text(data.departmentName || 'Atelier', 120, metaY + 42);

      // Col 2
      doc.fillColor('#64748b').font('Helvetica').text('Location/Hub:', 300, metaY);
      doc.fillColor('#0f172a').font('Helvetica-Bold').text(data.locationName || 'Belagavi Flagship', 370, metaY);
      doc.fillColor('#64748b').font('Helvetica').text('Bank Account:', 300, metaY + 14);
      doc.fillColor('#0f172a').font('Helvetica').text(data.bankAccount ? `•••• ${data.bankAccount.slice(-4)}` : 'On File', 370, metaY + 14);
      doc.fillColor('#64748b').font('Helvetica').text('PAN Number:', 300, metaY + 28);
      doc.fillColor('#0f172a').font('Helvetica').text(data.pan || 'On File', 370, metaY + 28);
      doc.fillColor('#64748b').font('Helvetica').text('Pay Period:', 300, metaY + 42);
      doc.fillColor('#0f172a').font('Helvetica').text(`${pStart} – ${pEnd}`, 370, metaY + 42);

      doc.y = 206;

      // --- EARNINGS & DEDUCTIONS TABLES ---
      const tableTop = doc.y;
      const colWidth = 256;
      const leftColX = 36;
      const rightColX = 303;

      // Header Boxes
      doc.rect(leftColX, tableTop, colWidth, 20).fill('#0058be');
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold').text('EARNINGS & ALLOWANCES', leftColX + 10, tableTop + 5);
      doc.text('AMOUNT', leftColX + colWidth - 70, tableTop + 5, { width: 60, align: 'right' });

      doc.rect(rightColX, tableTop, colWidth, 20).fill('#be123c');
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold').text('STATUTORY DEDUCTIONS', rightColX + 10, tableTop + 5);
      doc.text('AMOUNT', rightColX + colWidth - 70, tableTop + 5, { width: 60, align: 'right' });

      let leftY = tableTop + 24;
      let rightY = tableTop + 24;

      // Earnings items
      const earningsList: Array<{ label: string; amount: number }> = [
        { label: 'Basic Salary (Karnataka Form T)', amount: Number(data.basicSalary || 0) },
        { label: 'House Rent Allowance (HRA 40%)', amount: Number(data.hra || (data.basicSalary * 0.4)) },
        { label: 'Special & Conveyance Allowances', amount: Number(data.allowances || 2500) },
        { label: 'Early Login Adherence Bonus', amount: Number(data.earlyIncentive || 0) },
        { label: 'Full Attendance Bonus (100%)', amount: Number(data.attendanceIncentive || 0) },
        { label: 'Sales & Target Commissions', amount: Number(data.salesIncentive || 0) },
        { label: 'Approved Overtime (OT 2x)', amount: Number(data.overtime || 0) },
      ];
      if (Number(data.bonus) > 0) earningsList.push({ label: 'Festival / Performance Bonus', amount: Number(data.bonus) });

      earningsList.forEach((e) => {
        doc.fillColor('#334155').fontSize(8.5).font('Helvetica').text(e.label, leftColX + 8, leftY);
        doc.fillColor('#0f172a').font('Helvetica-Bold').text(formatCurrency(e.amount), leftColX + colWidth - 85, leftY, { width: 75, align: 'right' });
        doc.rect(leftColX, leftY + 12, colWidth, 0.5).strokeColor('#e2e8f0').stroke();
        leftY += 16;
      });

      // Deductions items
      const pfEst = Number(data.pfDeduction || Math.round(Number(data.basicSalary || 0) * 0.12));
      const ptEst = 200;
      const taxEst = Number(data.taxDeduction || 0);
      const penEst = Number(data.penalties || 0);
      const lopEst = Number(data.lopDeduction || 0);

      const deductionsList: Array<{ label: string; amount: number }> = [
        { label: 'Provident Fund (EPF 12%)', amount: pfEst },
        { label: 'Professional Tax (Karnataka PT)', amount: ptEst },
        { label: 'Income Tax TDS (Sec 192)', amount: taxEst },
        { label: 'Biometric Late Arrival Penalties', amount: penEst },
        { label: 'Loss of Pay / Unapproved Leaves', amount: lopEst },
      ];

      deductionsList.forEach((d) => {
        doc.fillColor('#334155').fontSize(8.5).font('Helvetica').text(d.label, rightColX + 8, rightY);
        doc.fillColor('#0f172a').font('Helvetica-Bold').text(formatCurrency(d.amount), rightColX + colWidth - 85, rightY, { width: 75, align: 'right' });
        doc.rect(rightColX, rightY + 12, colWidth, 0.5).strokeColor('#e2e8f0').stroke();
        rightY += 16;
      });

      const maxY = Math.max(leftY, rightY) + 4;
      const totalGross = earningsList.reduce((acc, curr) => acc + curr.amount, 0);
      const totalDeductions = deductionsList.reduce((acc, curr) => acc + curr.amount, 0);
      const calculatedNetPay = Math.max(0, totalGross - totalDeductions);

      // Totals Strip
      doc.rect(leftColX, maxY, colWidth, 20).fill('#f1f5f9');
      doc.fillColor('#0f172a').fontSize(8.5).font('Helvetica-Bold').text('GROSS EARNINGS (A)', leftColX + 8, maxY + 5);
      doc.text(formatCurrency(totalGross), leftColX + colWidth - 85, maxY + 5, { width: 75, align: 'right' });

      doc.rect(rightColX, maxY, colWidth, 20).fill('#f1f5f9');
      doc.fillColor('#0f172a').fontSize(8.5).font('Helvetica-Bold').text('TOTAL DEDUCTIONS (B)', rightColX + 8, maxY + 5);
      doc.text(formatCurrency(totalDeductions), rightColX + colWidth - 85, maxY + 5, { width: 75, align: 'right' });

      doc.y = maxY + 28;

      // --- CUSTOM SECTIONS (HR ADDED DYNAMIC BLOCKS) ---
      if (data.customSections && Array.isArray(data.customSections) && data.customSections.length > 0) {
        data.customSections.forEach((sec) => {
          doc.rect(36, doc.y, 523, 18).fill('#f8fafc').strokeColor('#cbd5e1').stroke();
          doc.fillColor('#0f172a').fontSize(8.5).font('Helvetica-Bold').text(sec.title.toUpperCase(), 44, doc.y + 4);
          doc.y += 22;

          sec.items.forEach((item) => {
            doc.fillColor('#475569').fontSize(8).font('Helvetica').text(`• ${item.label}`, 48, doc.y);
            doc.fillColor('#0f172a').font('Helvetica-Bold').text(formatCurrency(item.amount), 450, doc.y, { width: 100, align: 'right' });
            doc.y += 14;
          });
          doc.y += 4;
        });
      }

      // --- NET TAKE HOME SALARY BOX ---
      const netBoxY = Math.max(doc.y + 6, 430);
      doc.rect(36, netBoxY, 523, 44).fill('#022c22').strokeColor('#059669').lineWidth(1.5).stroke();
      doc.fillColor('#34d399').fontSize(10).font('Helvetica-Bold').text('NET TAKE-HOME PAY (A - B):', 48, netBoxY + 10);
      doc.fillColor('#ffffff').fontSize(14).font('Helvetica-Bold').text(formatCurrency(calculatedNetPay), 360, netBoxY + 8, { width: 190, align: 'right' });
      doc.fillColor('#94a3b8').fontSize(7.5).font('Helvetica').text(`In Words: ${numberToWordsINR(calculatedNetPay)}`, 48, netBoxY + 26);

      // --- REMARKS (IF ANY) ---
      if (data.remarks) {
        doc.y = netBoxY + 52;
        doc.rect(36, doc.y, 523, 26).fill('#fffbeb').strokeColor('#fde68a').stroke();
        doc.fillColor('#92400e').fontSize(8).font('Helvetica-Bold').text('HR Adjustments & Audit Remarks: ', 44, doc.y + 5, { continued: true });
        doc.font('Helvetica').text(data.remarks);
      }

      // --- STATUTORY DECLARATION & SIGNATURE FOOTER ---
      const footY = 680;
      doc.rect(36, footY, 523, 0.5).strokeColor('#cbd5e1').stroke();

      doc.fillColor('#64748b').fontSize(7.5).font('Helvetica')
        .text('Note: This is a system-certified statutory wage statement under Rule 29(2) of Karnataka Shops and Commercial Establishments Rules, 1963.', 36, footY + 8, { width: 330 });
      doc.text('For queries regarding deductions or tax computations, contact hr@bsctextiles.in within 7 days of pay disbursal.', 36, footY + 22, { width: 330 });

      // Signatory block
      doc.fillColor('#0f172a').fontSize(8.5).font('Helvetica-Bold').text(signatory, 390, footY + 8, { width: 160, align: 'right' });
      doc.fillColor('#64748b').fontSize(7.5).font('Helvetica').text(signatoryRole, 390, footY + 20, { width: 160, align: 'right' });
      doc.fillColor('#0058be').fontSize(7.5).font('Helvetica-Bold').text('BSC Textiles Directorate', 390, footY + 32, { width: 160, align: 'right' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
