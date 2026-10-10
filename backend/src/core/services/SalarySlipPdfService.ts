import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

export interface PayslipPdfData {
  payslipId: string;
  version: number;
  employeeName: string;
  employeeCode: string;
  departmentName?: string;
  locationName?: string;
  designation?: string;
  periodStart: string;
  periodEnd: string;
  paidDays?: number;
  basicSalary: number;
  allowances: number;
  earlyIncentive?: number;
  salesIncentive?: number;
  attendanceIncentive?: number;
  overtimePay?: number;
  latePenalties?: number;
  breakPenalties?: number;
  statutoryDeductions: number;
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
}

export class SalarySlipPdfService {
  private readonly storageDir: string;

  constructor(storageDir = 'uploads/payslips') {
    this.storageDir = path.resolve(process.cwd(), storageDir);
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  public async generatePdf(data: PayslipPdfData): Promise<{ filePath: string; buffer: Buffer }> {
    const fileName = `payslip_${data.employeeCode}_${data.payslipId}_v${data.version}.pdf`;
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
          console.warn('[SalarySlipPdfService] File write warning:', e);
        }
        resolve({ filePath, buffer: pdfData });
      });
      doc.on('error', reject);

      // Header Banner
      doc.rect(40, 40, 515, 60).fill('#0058BE');
      doc.fillColor('#FFFFFF').fontSize(16).font('Helvetica-Bold')
        .text('BSC TEXTILES PVT LTD', 55, 52);
      doc.fontSize(9).font('Helvetica')
        .text('Established 1938 • Khade Bazar, Belagavi, Karnataka', 55, 72);
      doc.fillColor('#FDE047').fontSize(11).font('Helvetica-Bold')
        .text('SALARY SLIP (FORM T)', 350, 55, { align: 'right' });
      doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica')
        .text(`Pay Period: ${data.periodStart.slice(0, 10)} to ${data.periodEnd.slice(0, 10)}`, 320, 72, { align: 'right' });

      // Employee Dossier
      doc.rect(40, 108, 515, 65).fill('#F8FAFC').stroke('#E2E8F0');
      doc.fillColor('#0F172A').fontSize(9).font('Helvetica-Bold')
        .text('Employee Code:', 55, 118)
        .font('Helvetica').text(data.employeeCode, 140, 118)
        .font('Helvetica-Bold').text('Employee Name:', 310, 118)
        .font('Helvetica').text(data.employeeName, 410, 118);

      doc.font('Helvetica-Bold').text('Store Location:', 55, 136)
        .font('Helvetica').text(data.locationName || 'Belagavi Head Store', 140, 136)
        .font('Helvetica-Bold').text('Department:', 310, 136)
        .font('Helvetica').text(data.departmentName || 'Showroom Operations', 410, 136);

      doc.font('Helvetica-Bold').text('Paid Days:', 55, 154)
        .font('Helvetica').text(String(data.paidDays || 30), 140, 154)
        .font('Helvetica-Bold').text('Slip Version:', 310, 154)
        .font('Helvetica').text(`Version ${data.version} (Approved)`, 410, 154);

      // Earnings & Deductions Tables
      const startY = 188;
      doc.rect(40, startY, 250, 22).fill('#1E293B');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9)
        .text('EARNINGS & INCENTIVES', 50, startY + 6);

      doc.rect(305, startY, 250, 22).fill('#1E293B');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9)
        .text('DEDUCTIONS & RECOVERIES', 315, startY + 6);

      const items = [
        { earnLabel: 'Basic Monthly Salary', earnVal: Number(data.basicSalary || 0), dedLabel: 'Statutory Taxes (PF/PT/TDS)', dedVal: Number(data.statutoryDeductions || 0) },
        { earnLabel: 'House Rent Allowance (HRA)', earnVal: Number(data.allowances || 0), dedLabel: 'Late Punch Penalties', dedVal: Number(data.latePenalties || 0) },
        { earnLabel: 'Early Check-In Incentive', earnVal: Number(data.earlyIncentive || 0), dedLabel: 'Break Overrun Penalties', dedVal: Number(data.breakPenalties || 0) },
        { earnLabel: 'Sales Target Bonus', earnVal: Number(data.salesIncentive || 0), dedLabel: 'Other Authorized Recoveries', dedVal: 0 },
        { earnLabel: 'Showroom Overtime Hours', earnVal: Number(data.overtimePay || 0), dedLabel: 'Salary Advance Deductions', dedVal: 0 },
      ];

      let rowY = startY + 28;
      doc.font('Helvetica').fontSize(9);
      for (const item of items) {
        doc.fillColor('#1E293B')
          .text(item.earnLabel, 50, rowY)
          .text(`₹${item.earnVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 220, rowY, { align: 'right' })
          .text(item.dedLabel, 315, rowY)
          .text(`₹${item.dedVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 485, rowY, { align: 'right' });
        doc.moveTo(40, rowY + 16).lineTo(290, rowY + 16).strokeColor('#E2E8F0').stroke();
        doc.moveTo(305, rowY + 16).lineTo(555, rowY + 16).strokeColor('#E2E8F0').stroke();
        rowY += 20;
      }

      // Totals
      rowY += 6;
      doc.rect(40, rowY, 250, 20).fill('#EFF6FF');
      doc.fillColor('#0058BE').font('Helvetica-Bold').fontSize(9)
        .text('Gross Earnings:', 50, rowY + 5)
        .text(`₹${data.grossEarnings.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 220, rowY + 5, { align: 'right' });

      doc.rect(305, rowY, 250, 20).fill('#FEF2F2');
      doc.fillColor('#B91C1C').font('Helvetica-Bold').fontSize(9)
        .text('Total Deductions:', 315, rowY + 5)
        .text(`₹${data.totalDeductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 485, rowY + 5, { align: 'right' });

      // Net Take Home Box
      rowY += 32;
      doc.rect(40, rowY, 515, 45).fill('#059669');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(11)
        .text('NET SALARY TAKE-HOME', 55, rowY + 16);
      doc.fontSize(15)
        .text(`₹${data.netPay.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 380, rowY + 14, { align: 'right' });

      // Legal disclaimer
      rowY += 60;
      doc.fillColor('#64748B').fontSize(7.5).font('Helvetica')
        .text('This is a computer-generated salary slip authorized by BSC Textiles Pvt Ltd payroll engine. Confidential document for employee records.', 40, rowY, { width: 515, align: 'center' });

      doc.end();
    });
  }
}
