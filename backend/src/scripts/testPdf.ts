import { generatePayslipPdf } from '../services/payrollPdfService.js';
import fs from 'fs';
import path from 'path';

async function test() {
  const buf = await generatePayslipPdf({
    id: 'test',
    employeeCode: '1372',
    fullName: 'SADASHIVA LINGARAJAPPA HADIMANI',
    designation: 'Sales Specialist',
    basicSalary: 12000,
    hra: 4000,
    netPay: 18782.50,
    status: 'APPROVED',
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    salaryMonth: 'Aug',
    salaryYear: 2026,
    pfPay: 12000,
    fixedGrossSalary: 16000,
    perDaySalary: 516.13,
    daysPayable: 31,
    pfNo: '10653',
    esiNo: '5858975468',
    uanNo: '101278107174',
    bankName: 'HDFC',
    bankAccount: '50100374312528',
    salesmanNo: '1372',
    section: 'KIDS',
    shift: 'SHIFT II',
    batch: 'SHIFT II',
    locationCode: 'BSCTEX',
    grossSalary: 20375.50,
    grossDeductions: 1593.00,
    totalPayable: 18782.50,
    salaryAdvance: 0,
    loanAdvance: 0,
    netPayable: 18782.50,
    employerPf: 1440.00,
    employerEsi: 662.00,
    ctc: 22478.00,
    earningsList: [
      { label: 'BASIC PAY', amount: 12000 },
      { label: 'HRA', amount: 4000 },
      { label: 'OT', amount: 3859.50 },
      { label: 'GOVT.HOLIDAY', amount: 516.00 }
    ],
    deductionsList: [
      { label: 'EMPLOYEE PF', amount: 1440 },
      { label: 'EMPLOYEE ESI', amount: 153 },
      { label: 'PROF TAX', amount: 0 }
    ]
  });

  const outPath = path.resolve(process.cwd(), 'sample_test_payslip.pdf');
  fs.writeFileSync(outPath, buf);
  console.log('SUCCESS! PDF GENERATED & WRITTEN TO:', outPath, 'SIZE:', buf.length, 'BYTES');
}

test().catch(console.error);
