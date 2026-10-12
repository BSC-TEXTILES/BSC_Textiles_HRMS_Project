import PDFDocument from 'pdfkit';

export interface PayslipItemDetail {
  label: string;
  amount: number;
}

export interface PayslipPdfData {
  id: string;
  employeeCode: string;
  fullName: string;
  designation?: string;
  departmentName?: string;
  locationName?: string;
  pan?: string;
  uan?: string;
  pfNo?: string;
  esiNo?: string;
  uanNo?: string;
  bankName?: string;
  bankAccount?: string;
  maskBankAccount?: boolean;
  salesmanNo?: string;
  section?: string;
  shift?: string;
  batch?: string;
  locationCode?: string;
  periodStart: string | Date;
  periodEnd: string | Date;
  salaryMonth?: string;
  salaryYear?: number | string;
  pfPay?: number;
  hra?: number;
  fixedGrossSalary?: number;
  perDaySalary?: number;
  daysPayable?: number;
  paidHolidays?: number;
  paidLeaves?: number;
  basicSalary: number;
  allowances?: number;
  earlyIncentive?: number;
  attendanceIncentive?: number;
  salesIncentive?: number;
  overtime?: number;
  bonus?: number;
  deductions?: number;
  pfDeduction?: number;
  taxDeduction?: number;
  lopDeduction?: number;
  penalties?: number;
  netPay: number;
  status: string;
  // Specific line items
  earningsList?: PayslipItemDetail[];
  deductionsList?: PayslipItemDetail[];
  grossSalary?: number;
  grossDeductions?: number;
  totalPayable?: number;
  salaryAdvance?: number;
  loanAdvance?: number;
  netPayable?: number;
  employeePf?: number;
  employeeEsi?: number;
  employerPf?: number;
  employerEsi?: number;
  ctc?: number;
  customSections?: Array<{
    title: string;
    items: Array<{ label: string; amount: number; type: 'earning' | 'deduction' | 'info' }>;
  }>;
  remarks?: string;
  templateStyle?: 'AUTHENTIC_BSC' | 'MODERN_EXECUTIVE';
}

export interface PayrollSettingsData {
  companyName?: string;
  companyAddress?: string;
  branchAddress?: string;
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

function maskAcc(acc?: string, mask: boolean = true): string {
  if (!acc) return 'N/A';
  if (!mask) return acc;
  if (acc.length <= 4) return acc;
  const last4 = acc.slice(-4);
  return 'X'.repeat(Math.max(4, acc.length - 4)) + last4;
}

function fmtVal(val: number | undefined | null): string {
  if (val === undefined || val === null || isNaN(Number(val))) return '.00';
  const num = Number(val);
  return num.toFixed(2);
}

export async function generatePayslipPdf(data: PayslipPdfData, settings?: PayrollSettingsData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      // Standard A4 portrait: 595.28 x 841.89 pt
      const doc = new PDFDocument({ margin: 30, size: 'A4' });
      const buffers: Buffer[] = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const companyName = settings?.companyName || 'BSC TEXTILES PVT LTD.,';
      const companyAddress = settings?.companyAddress || 'DENTAL COLLEGE ROAD,, DAVANGERE - 577004';
      
      const pEndDate = new Date(data.periodEnd);
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthStr = data.salaryMonth || (isNaN(pEndDate.getTime()) ? 'Aug' : monthNames[pEndDate.getMonth()]);
      const yearStr = data.salaryYear || (isNaN(pEndDate.getTime()) ? 2026 : pEndDate.getFullYear());
      const periodTitle = `salary for the Month of ${monthStr}-${yearStr}`;

      const leftX = 35;
      const rightX = 560;
      const boxWidth = rightX - leftX; // 525 pt

      // Function to draw dashed border box
      const drawDashedBox = (yTop: number, height: number) => {
        doc.save();
        doc.lineWidth(0.7);
        doc.dash(3, { space: 2 });
        doc.strokeColor('#222222');
        doc.rect(leftX, yTop, boxWidth, height).stroke();
        doc.restore();
      };

      // Function to draw dashed horizontal line
      const drawDashedHLine = (yPos: number, xStart = leftX, xEnd = rightX) => {
        doc.save();
        doc.lineWidth(0.7);
        doc.dash(3, { space: 2 });
        doc.strokeColor('#222222');
        doc.moveTo(xStart, yPos).lineTo(xEnd, yPos).stroke();
        doc.restore();
      };

      // Function to draw dashed vertical line
      const drawDashedVLine = (xPos: number, yStart: number, yEnd: number) => {
        doc.save();
        doc.lineWidth(0.7);
        doc.dash(3, { space: 2 });
        doc.strokeColor('#222222');
        doc.moveTo(xPos, yStart).lineTo(xPos, yEnd).stroke();
        doc.restore();
      };

      // Set monospaced font
      doc.font('Courier');
      doc.fontSize(9.5);
      doc.fillColor('#000000');

      let curY = 40;

      // -------------------------------------------------------------
      // 1. COMPANY HEADER BOX (DASHED)
      // -------------------------------------------------------------
      const headerHeight = 52;
      drawDashedBox(curY, headerHeight);

      doc.font('Courier-Bold').fontSize(10).text(companyName, leftX, curY + 8, {
        width: boxWidth,
        align: 'center',
      });
      doc.font('Courier').fontSize(8.5).text(companyAddress, leftX, curY + 22, {
        width: boxWidth,
        align: 'center',
      });
      doc.font('Courier-Bold').fontSize(9).text(periodTitle, leftX, curY + 36, {
        width: boxWidth,
        align: 'center',
      });

      curY += headerHeight + 6;

      // -------------------------------------------------------------
      // 2. EMPLOYEE & PAYROLL DETAILS BOX
      // -------------------------------------------------------------
      const empBoxTop = curY;
      const empBoxHeight = 152;
      drawDashedBox(empBoxTop, empBoxHeight);

      const col1LabelX = leftX + 8;
      const col1ValX = leftX + 110;
      const col2LabelX = leftX + 270;
      const col2ValX = leftX + 380;

      let lineY = empBoxTop + 8;
      const rowGap = 13.5;

      // Row 1: NAME
      doc.font('Courier-Bold').fontSize(8.5);
      doc.text('NAME', col1LabelX, lineY);
      doc.font('Courier').text(`: ${data.fullName?.toUpperCase() || 'N/A'}`, col1ValX - 10, lineY);
      lineY += rowGap;

      // Row 2: PF NO | ESI NO
      doc.font('Courier-Bold').text('PF NO', col1LabelX, lineY);
      doc.font('Courier').text(`: ${data.pfNo || 'N/A'}`, col1ValX - 10, lineY);
      doc.font('Courier-Bold').text('ESI NO', col2LabelX, lineY);
      doc.font('Courier').text(`: ${data.esiNo || 'N/A'}`, col2ValX - 10, lineY);
      lineY += rowGap;

      // Row 3: EMP.NO | UAN NO
      doc.font('Courier-Bold').text('EMP.NO', col1LabelX, lineY);
      doc.font('Courier').text(`: ${data.employeeCode || 'N/A'}`, col1ValX - 10, lineY);
      doc.font('Courier-Bold').text('UAN NO', col2LabelX, lineY);
      doc.font('Courier').text(`: ${data.uanNo || data.uan || 'N/A'}`, col2ValX - 10, lineY);
      lineY += rowGap;

      // Row 4: BANK NAME | ACCOUNT
      doc.font('Courier-Bold').text('BANK NAME', col1LabelX, lineY);
      doc.font('Courier').text(`: ${data.bankName || 'N/A'}`, col1ValX - 10, lineY);
      doc.font('Courier-Bold').text('ACCOUNT', col2LabelX, lineY);
      const displayAcc = data.maskBankAccount !== false ? maskAcc(data.bankAccount, true) : (data.bankAccount || 'N/A');
      doc.font('Courier').text(`: ${displayAcc}`, col2ValX - 10, lineY);
      lineY += rowGap;

      // Row 5: SALESMAN NO
      doc.font('Courier-Bold').text('SALESMAN NO', col1LabelX, lineY);
      doc.font('Courier').text(`: ${data.salesmanNo || data.employeeCode || 'N/A'}`, col1ValX - 10, lineY);
      lineY += rowGap;

      // Row 6: SECTION | LOCATION
      doc.font('Courier-Bold').text('SECTION', col1LabelX, lineY);
      doc.font('Courier').text(`: ${data.section || data.departmentName || 'KIDS'}`, col1ValX - 10, lineY);
      doc.font('Courier-Bold').text('LOCATION', col2LabelX, lineY);
      doc.font('Courier').text(`: ${data.locationCode || 'BSCTEX'}`, col2ValX - 10, lineY);
      lineY += rowGap;

      // Row 7: SHIFT | BATCH
      doc.font('Courier-Bold').text('SHIFT', col1LabelX, lineY);
      doc.font('Courier').text(`: ${data.shift || 'SHIFT II'}`, col1ValX - 10, lineY);
      doc.font('Courier-Bold').text('BATCH', col2LabelX, lineY);
      doc.font('Courier').text(`: ${data.batch || data.shift || 'SHIFT II'}`, col2ValX - 10, lineY);
      lineY += rowGap;

      // Row 8: PF PAY | PER DAY SALARY
      const pfPayVal = data.pfPay !== undefined ? data.pfPay : (data.basicSalary || 12000);
      doc.font('Courier-Bold').text('PF PAY', col1LabelX, lineY);
      doc.font('Courier').text(`: ${fmtVal(pfPayVal)}`, col1ValX - 10, lineY);
      doc.font('Courier-Bold').text('PER DAY SALARY', col2LabelX, lineY);
      doc.font('Courier').text(`: ${fmtVal(data.perDaySalary)}`, col2ValX - 10, lineY);
      lineY += rowGap;

      // Row 9: HRA | DAYS PAYABLE
      doc.font('Courier-Bold').text('HRA', col1LabelX, lineY);
      doc.font('Courier').text(`: ${fmtVal(data.hra)}`, col1ValX - 10, lineY);
      doc.font('Courier-Bold').text('DAYS PAYABLE', col2LabelX, lineY);
      doc.font('Courier').text(`: ${fmtVal(data.daysPayable || 31)}`, col2ValX - 10, lineY);
      lineY += rowGap;

      // Row 10: GROSS SALARY (Structure)
      doc.font('Courier-Bold').text('GROSS SALARY', col1LabelX, lineY);
      doc.font('Courier').text(`: ${fmtVal(data.fixedGrossSalary || (Number(data.basicSalary || 0) + Number(data.hra || 0)))}`, col1ValX - 10, lineY);

      curY += empBoxHeight + 6;

      // -------------------------------------------------------------
      // 3. EARNINGS & DEDUCTIONS DUAL TABLE
      // -------------------------------------------------------------
      const tblTop = curY;
      const midX = leftX + (boxWidth / 2); // 297.5 pt

      // Earnings & Deductions items
      const earnings = data.earningsList && data.earningsList.length > 0 ? data.earningsList : [
        { label: 'BASIC PAY', amount: Number(data.basicSalary || 12000) },
        { label: 'HRA', amount: Number(data.hra || 4000) },
        { label: 'OT', amount: Number(data.overtime || 0) },
        { label: 'GOVT.HOLIDAY', amount: Number((data as any).govtHolidayPay || 0) },
      ].filter(e => e.amount > 0 || e.label === 'BASIC PAY' || e.label === 'HRA');

      const deductions = data.deductionsList && data.deductionsList.length > 0 ? data.deductionsList : [
        { label: 'EMPLOYEE PF', amount: Number(data.pfDeduction || data.employeePf || 1440) },
        { label: 'EMPLOYEE ESI', amount: Number(data.employeeEsi || (Number(data.grossSalary || 0) * 0.0075) || 153) },
        { label: 'PROF TAX', amount: Number((data as any).profTax || 0) },
      ];

      const maxRows = Math.max(earnings.length, deductions.length, 4);
      const rowH = 14;
      const headerH = 18;
      const subTotalH = 18;
      const totalPayableH = 26;
      const netPayableH = 18;
      const mainTableHeight = headerH + (maxRows * rowH) + subTotalH + totalPayableH + netPayableH;

      drawDashedBox(tblTop, mainTableHeight);
      drawDashedVLine(midX, tblTop, tblTop + mainTableHeight);

      // Table Header
      drawDashedHLine(tblTop + headerH);
      doc.font('Courier-Bold').fontSize(8.5);
      doc.text('EARNINGS', leftX + 8, tblTop + 5);
      doc.text('CURRENT MONTH', midX - 95, tblTop + 5, { width: 90, align: 'right' });

      doc.text('DEDUCTIONS', midX + 8, tblTop + 5);
      doc.text('CURRENT MONTH', rightX - 95, tblTop + 5, { width: 90, align: 'right' });

      // Rows
      let rY = tblTop + headerH + 3;
      for (let i = 0; i < maxRows; i++) {
        const e = earnings[i];
        const d = deductions[i];

        if (e) {
          doc.font('Courier-Bold').text(e.label, leftX + 8, rY);
          doc.font('Courier').text(':', leftX + 115, rY);
          doc.text(fmtVal(e.amount), midX - 95, rY, { width: 90, align: 'right' });
        }

        if (d) {
          doc.font('Courier-Bold').text(d.label, midX + 8, rY);
          doc.font('Courier').text(':', midX + 115, rY);
          doc.text(fmtVal(d.amount), rightX - 95, rY, { width: 90, align: 'right' });
        }

        rY += rowH;
      }

      // Sub-Totals Strip
      const subTotalY = tblTop + headerH + (maxRows * rowH);
      drawDashedHLine(subTotalY);
      drawDashedHLine(subTotalY + subTotalH);

      const totalGrossEarn = data.grossSalary !== undefined ? data.grossSalary : earnings.reduce((acc, c) => acc + c.amount, 0);
      const totalGrossDed = data.grossDeductions !== undefined ? data.grossDeductions : deductions.reduce((acc, c) => acc + c.amount, 0);

      doc.font('Courier-Bold').text('GROSS SALARY', leftX + 8, subTotalY + 4);
      doc.font('Courier').text(':', leftX + 115, subTotalY + 4);
      doc.text(fmtVal(totalGrossEarn), midX - 95, subTotalY + 4, { width: 90, align: 'right' });

      doc.font('Courier-Bold').text('GROSS DEDUCTIONS', midX + 8, subTotalY + 4);
      doc.font('Courier').text(':', midX + 115, subTotalY + 4);
      doc.text(fmtVal(totalGrossDed), rightX - 95, subTotalY + 4, { width: 90, align: 'right' });

      // Total Payable & Advance Strip
      const totalPayableY = subTotalY + subTotalH;
      drawDashedHLine(totalPayableY + totalPayableH);

      const totPayableVal = data.totalPayable !== undefined ? data.totalPayable : Math.max(0, totalGrossEarn - totalGrossDed);
      doc.font('Courier-Bold').text('TOTAL PAYABLE', leftX + 8, totalPayableY + 5);
      doc.font('Courier').text(':', leftX + 115, totalPayableY + 5);
      doc.text(fmtVal(totPayableVal), midX - 95, totalPayableY + 5, { width: 90, align: 'right' });

      // Right: Salary Advance & Loan Advance
      doc.font('Courier-Bold').text('SALARY ADVANCE', midX + 8, totalPayableY + 3);
      doc.font('Courier').text(':', midX + 115, totalPayableY + 3);
      doc.text(fmtVal(data.salaryAdvance || 0), rightX - 95, totalPayableY + 3, { width: 90, align: 'right' });

      doc.font('Courier-Bold').text('LOAN ADVANCE', midX + 8, totalPayableY + 14);
      doc.font('Courier').text(':', midX + 115, totalPayableY + 14);
      doc.text(fmtVal(data.loanAdvance || 0), rightX - 95, totalPayableY + 14, { width: 90, align: 'right' });

      // Net Payable Strip (Full Width)
      const netPayableY = totalPayableY + totalPayableH;
      const finalNet = data.netPayable !== undefined ? data.netPayable : (data.netPay || totPayableVal);
      doc.font('Courier-Bold').text('NET PAYABLE', leftX + 8, netPayableY + 4);
      doc.font('Courier').text(':', leftX + 115, netPayableY + 4);
      doc.font('Courier-Bold').text(fmtVal(finalNet), leftX + 130, netPayableY + 4, { width: 140, align: 'right' });

      curY += mainTableHeight + 8;

      // -------------------------------------------------------------
      // 4. EMPLOYER CONTRIBUTIONS & CTC BOX
      // -------------------------------------------------------------
      const employerBoxH = 50;
      drawDashedBox(curY, employerBoxH);

      const empPfVal = data.employerPf !== undefined ? data.employerPf : Math.round(Number(data.basicSalary || 12000) * 0.12);
      const empEsiVal = data.employerEsi !== undefined ? data.employerEsi : Math.round(Number(totalGrossEarn) * 0.0325);
      const ctcVal = data.ctc !== undefined ? data.ctc : Math.round(totalGrossEarn + empPfVal + empEsiVal);

      let empY = curY + 6;
      doc.font('Courier-Bold').text('EMPLOYER PF', leftX + 8, empY);
      doc.font('Courier').text(':', leftX + 115, empY);
      doc.text(fmtVal(empPfVal), leftX + 130, empY, { width: 140, align: 'right' });
      empY += 13.5;

      doc.font('Courier-Bold').text('EMPLOYER ESI', leftX + 8, empY);
      doc.font('Courier').text(':', leftX + 115, empY);
      doc.text(fmtVal(empEsiVal), leftX + 130, empY, { width: 140, align: 'right' });
      empY += 13.5;

      // Divider inside employer box
      drawDashedHLine(empY, leftX, leftX + 280);

      doc.font('Courier-Bold').text('CTC', leftX + 8, empY + 3);
      doc.font('Courier').text(':', leftX + 115, empY + 3);
      doc.font('Courier-Bold').text(fmtVal(ctcVal), leftX + 130, empY + 3, { width: 140, align: 'right' });

      curY += employerBoxH + 12;

      // -------------------------------------------------------------
      // 5. WORDS & REMARKS & STATUTORY FOOTER
      // -------------------------------------------------------------
      doc.font('Courier').fontSize(8);
      doc.text(`Net Amount in Words: ${numberToWordsINR(finalNet)}`, leftX, curY);
      curY += 12;

      if (data.remarks) {
        doc.font('Courier-Bold').text('HR Remarks: ', leftX, curY, { continued: true });
        doc.font('Courier').text(data.remarks);
        curY += 12;
      }

      curY += 15;
      drawDashedHLine(curY);
      curY += 6;

      doc.font('Courier').fontSize(7).text(
        'This is a computer-generated payslip under Karnataka Shops & Commercial Establishments Act. Authorized Signatory: BSC Textiles Pvt Ltd.',
        leftX,
        curY,
        { width: boxWidth, align: 'center' }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
