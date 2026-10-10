import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

/**
 * SettlementPdfService: Generates professional BSC Textiles F&F Settlement Statement PDF
 */
export class SettlementPdfService {
  private readonly storageDir: string;

  constructor(storageDir = 'uploads/settlements') {
    this.storageDir = path.resolve(process.cwd(), storageDir);
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  public async generatePdf(data: {
    settlementId: string;
    employeeName: string;
    employeeCode: string;
    departmentName?: string;
    locationName?: string;
    lastWorkingDay: string;
    resignationDate: string;
    totalEarnings: number;
    totalDeductions: number;
    netPayable: number;
    unpaidSalaryAmount: number;
    leaveEncashmentAmount: number;
    gratuityAmount: number;
    bonusIncentiveAmount: number;
    noticeRecoveryAmount: number;
    salaryAdvanceRecovery: number;
    statutoryDeductions: number;
    otherDeductions: number;
    paymentReference?: string | null;
    paymentDate?: string | null;
    paymentMode?: string | null;
  }): Promise<{ filePath: string; buffer: Buffer }> {
    const fileName = `fnf_${data.employeeCode}_${data.settlementId}.pdf`;
    const filePath = path.join(this.storageDir, fileName);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        try {
          fs.writeFileSync(filePath, pdfData);
        } catch (e) {
          console.warn('[SettlementPdfService] File write warning:', e);
        }
        resolve({ filePath, buffer: pdfData });
      });
      doc.on('error', reject);

      // Header Banner
      doc.rect(40, 40, 515, 65).fill('#081220');
      doc.fillColor('#FFFFFF').fontSize(16).font('Helvetica-Bold')
        .text('BSC TEXTILES PVT LTD', 55, 52);
      doc.fontSize(9).font('Helvetica')
        .text('Established 1938 • Karnataka Regional Store Network', 55, 72);
      doc.fillColor('#F59E0B').fontSize(11).font('Helvetica-Bold')
        .text('FULL & FINAL SETTLEMENT STATEMENT', 320, 62, { align: 'right' });

      // Employee Dossier Strip
      doc.rect(40, 115, 515, 75).fill('#F8FAFC').stroke('#E2E8F0');
      doc.fillColor('#0F172A').fontSize(9).font('Helvetica-Bold')
        .text('Employee Code:', 55, 125)
        .font('Helvetica').text(data.employeeCode, 150, 125)
        .font('Helvetica-Bold').text('Employee Name:', 310, 125)
        .font('Helvetica').text(data.employeeName, 410, 125);

      doc.font('Helvetica-Bold').text('Store Location:', 55, 145)
        .font('Helvetica').text(data.locationName || 'Belagavi Head Store', 150, 145)
        .font('Helvetica-Bold').text('Department:', 310, 145)
        .font('Helvetica').text(data.departmentName || 'Showroom Operations', 410, 145);

      doc.font('Helvetica-Bold').text('Resignation Date:', 55, 165)
        .font('Helvetica').text(data.resignationDate, 150, 165)
        .font('Helvetica-Bold').text('Last Working Day:', 310, 165)
        .font('Helvetica').text(data.lastWorkingDay, 410, 165);

      // Earnings & Deductions Tables
      const startY = 205;
      doc.rect(40, startY, 250, 24).fill('#0058BE');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10)
        .text('ELIGIBLE EARNINGS', 50, startY + 6);

      doc.rect(305, startY, 250, 24).fill('#B91C1C');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10)
        .text('AUTHORIZED DEDUCTIONS', 315, startY + 6);

      const items = [
        { earnLabel: 'Unpaid Monthly Salary', earnVal: data.unpaidSalaryAmount, dedLabel: 'Notice Shortfall Recovery', dedVal: data.noticeRecoveryAmount },
        { earnLabel: 'Leave Encashment', earnVal: data.leaveEncashmentAmount, dedLabel: 'Salary Advance / Loan Recovery', dedVal: data.salaryAdvanceRecovery },
        { earnLabel: 'Eligible Gratuity Amount', earnVal: data.gratuityAmount, dedLabel: 'Statutory Taxes & PF / PT', dedVal: data.statutoryDeductions },
        { earnLabel: 'Incentives & Monthly Bonus', earnVal: data.bonusIncentiveAmount, dedLabel: 'Other Authorized Deductions', dedVal: data.otherDeductions },
      ];

      let rowY = startY + 30;
      doc.font('Helvetica').fontSize(9);
      for (const item of items) {
        doc.fillColor('#1E293B')
          .text(item.earnLabel, 50, rowY)
          .text(`₹${item.earnVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 220, rowY, { align: 'right' })
          .text(item.dedLabel, 315, rowY)
          .text(`₹${item.dedVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 485, rowY, { align: 'right' });
        doc.moveTo(40, rowY + 16).lineTo(290, rowY + 16).strokeColor('#E2E8F0').stroke();
        doc.moveTo(305, rowY + 16).lineTo(555, rowY + 16).strokeColor('#E2E8F0').stroke();
        rowY += 22;
      }

      // Totals Row
      rowY += 10;
      doc.rect(40, rowY, 250, 22).fill('#EFF6FF');
      doc.fillColor('#0058BE').font('Helvetica-Bold').fontSize(10)
        .text('Total Earnings:', 50, rowY + 5)
        .text(`₹${data.totalEarnings.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 220, rowY + 5, { align: 'right' });

      doc.rect(305, rowY, 250, 22).fill('#FEF2F2');
      doc.fillColor('#B91C1C').font('Helvetica-Bold').fontSize(10)
        .text('Total Deductions:', 315, rowY + 5)
        .text(`₹${data.totalDeductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 485, rowY + 5, { align: 'right' });

      // Grand Net Payable Box
      rowY += 40;
      doc.rect(40, rowY, 515, 50).fill('#059669');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(12)
        .text('FINAL NET SETTLEMENT PAYABLE', 55, rowY + 18);
      doc.fontSize(16)
        .text(`₹${data.netPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 380, rowY + 16, { align: 'right' });

      // Payment Details (if paid)
      rowY += 65;
      if (data.paymentReference) {
        doc.rect(40, rowY, 515, 36).fill('#F0FDF4').stroke('#86EFAC');
        doc.fillColor('#166534').font('Helvetica-Bold').fontSize(9)
          .text(`Payment Confirmed via ${data.paymentMode || 'NEFT'} | Reference: ${data.paymentReference} | Date: ${data.paymentDate || 'N/A'}`, 55, rowY + 12);
        rowY += 46;
      }

      // Legal & Clearance Signatures
      rowY += 30;
      doc.fillColor('#64748B').fontSize(8).font('Helvetica')
        .text('I confirm receipt of full and final settlement as calculated above. All company assets and departmental clearances have been verified.', 40, rowY, { width: 515 });

      rowY += 40;
      doc.moveTo(50, rowY).lineTo(180, rowY).strokeColor('#94A3B8').stroke();
      doc.moveTo(375, rowY).lineTo(505, rowY).strokeColor('#94A3B8').stroke();

      doc.fillColor('#334155').fontSize(8).font('Helvetica-Bold')
        .text('Employee Signature & Date', 55, rowY + 6)
        .text('Authorized HR Signatory & Seal', 380, rowY + 6);

      doc.end();
    });
  }
}
