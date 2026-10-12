'use client';

import React, { useState } from 'react';
import {
  Printer,
  Download,
  Eye,
  EyeOff,
  Building2,
  FileText,
  Mail,
  Edit,
  CheckCircle,
  Copy,
  Info
} from 'lucide-react';
import toast from 'react-hot-toast';

export interface PayslipItemDetail {
  id?: string;
  label: string;
  amount: number;
  enabled?: boolean;
}

export interface PayslipData {
  id: string;
  employeeId?: string;
  employeeCode: string;
  fullName: string;
  employeeName?: string;
  designation?: string;
  departmentName?: string;
  section?: string;
  shift?: string;
  batch?: string;
  locationName?: string;
  locationCode?: string;
  pfNo?: string;
  esiNo?: string;
  uanNo?: string;
  bankName?: string;
  bankAccount?: string;
  salesmanNo?: string;
  salaryMonth?: string;
  salaryYear?: number | string;
  periodStart?: string;
  periodEnd?: string;
  pfPay?: number;
  fixedGrossSalary?: number;
  perDaySalary?: number;
  daysPayable?: number;
  basicSalary?: number;
  hra?: number;
  grossSalary?: number;
  totalEarnings?: number;
  totalDeductions?: number;
  totalPayable?: number;
  salaryAdvance?: number;
  loanAdvance?: number;
  netPayable?: number;
  netPay?: number;
  employerPf?: number;
  employerEsi?: number;
  ctc?: number;
  earningsConfig?: PayslipItemDetail[];
  deductionsConfig?: PayslipItemDetail[];
  remarks?: string;
  status?: string;
  customSections?: Array<{
    title: string;
    items: Array<{ name: string; amount: number; type: 'EARNING' | 'DEDUCTION' }>;
  }>;
}

export interface PayslipDocumentProps {
  payslip?: PayslipData;
  data?: PayslipData;
  onEdit?: () => void;
  onDownloadPdf?: () => void;
  onSendEmail?: () => void;
  showActions?: boolean;
  showDownload?: boolean;
  showPrint?: boolean;
  allowFormatSwitch?: boolean;
}

function numberToWordsINR(amount: number): string {
  const num = Math.floor(amount);
  if (num === 0) return 'Zero Rupees Only';

  const units = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
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

export function PayslipDocument({
  payslip,
  data,
  onEdit,
  onDownloadPdf,
  onSendEmail,
  showActions = true,
}: PayslipDocumentProps) {
  const [unmaskAccount, setUnmaskAccount] = useState(false);
  const [viewFormat, setViewFormat] = useState<'AUTHENTIC_BSC' | 'MODERN_EXECUTIVE'>('AUTHENTIC_BSC');

  const p = payslip || data;
  if (!p) return null;

  // Masked vs Unmasked account
  const rawAccount = p.bankAccount || '';
  const maskedAccount = rawAccount
    ? rawAccount.length > 4
      ? '•'.repeat(rawAccount.length - 4) + rawAccount.slice(-4)
      : rawAccount
    : 'Not Provided';
  const displayAccount = unmaskAccount ? rawAccount || 'Not Provided' : maskedAccount;

  // Month & Year string
  const monthStr = p.salaryMonth || 'Aug';
  const yearStr = p.salaryYear || '2026';

  // Earnings Items
  const earnings: PayslipItemDetail[] = p.earningsConfig && p.earningsConfig.length > 0
    ? p.earningsConfig.filter(e => e.enabled !== false)
    : [
        { label: 'BASIC PAY', amount: Number(p.basicSalary || 12000.00) },
        { label: 'HRA', amount: Number(p.hra || 4000.00) },
        ...(Number(p.grossSalary || 0) > 16000 ? [{ label: 'OT', amount: Number((p as any).otPay || 3859.50) }] : []),
        ...(Number((p as any).govtHolidayPay || 0) > 0 ? [{ label: 'GOVT.HOLIDAY', amount: Number((p as any).govtHolidayPay || 516.00) }] : []),
      ];

  // Deductions Items
  const deductions: PayslipItemDetail[] = p.deductionsConfig && p.deductionsConfig.length > 0
    ? p.deductionsConfig.filter(d => d.enabled !== false)
    : [
        { label: 'EMPLOYEE PF', amount: Number((p as any).employeePf || (p as any).pfDeduction || 1440.00) },
        { label: 'EMPLOYEE ESI', amount: Number((p as any).employeeEsi || 153.00) },
        { label: 'PROF TAX', amount: Number((p as any).profTax || 0.00) },
      ];

  // Totals
  const grossSalary = p.grossSalary !== undefined
    ? Number(p.grossSalary)
    : earnings.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const totalDeductions = p.totalDeductions !== undefined
    ? Number(p.totalDeductions)
    : deductions.reduce((sum, d) => sum + Number(d.amount || 0), 0);

  const totalPayable = p.totalPayable !== undefined
    ? Number(p.totalPayable)
    : Math.max(0, grossSalary - totalDeductions);

  const netPayable = p.netPayable !== undefined
    ? Number(p.netPayable)
    : (p.netPay !== undefined ? Number(p.netPay) : totalPayable);

  const employerPf = p.employerPf !== undefined
    ? Number(p.employerPf)
    : Math.round(Number(p.pfPay || p.basicSalary || 12000) * 0.12);

  const employerEsi = p.employerEsi !== undefined
    ? Number(p.employerEsi)
    : Math.round(Number(grossSalary) * 0.0325);

  const ctc = p.ctc !== undefined
    ? Number(p.ctc)
    : Math.round(grossSalary + employerPf + employerEsi);

  const formatCurr = (val: number | undefined | null) => {
    if (val === undefined || val === null || isNaN(Number(val))) return '0.00';
    return Number(val).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopySummary = () => {
    const text = `BSC TEXTILES PVT LTD - Payslip for ${monthStr}-${yearStr}\nEmployee: ${p.fullName} (${p.employeeCode})\nGross: ₹${formatCurr(grossSalary)}\nDeductions: ₹${formatCurr(totalDeductions)}\nNet Payable: ₹${formatCurr(netPayable)}\nCTC: ₹${formatCurr(ctc)}`;
    navigator.clipboard.writeText(text);
    toast.success('Payslip summary copied to clipboard');
  };

  return (
    <div className="w-full space-y-4">
      {/* ACTION & VIEW CONTROLS (HIDDEN DURING PRINT) */}
      {showActions && (
        <div className="no-print bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Format Toggle */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setViewFormat('AUTHENTIC_BSC')}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                viewFormat === 'AUTHENTIC_BSC'
                  ? 'bg-white text-[#722F37] shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              📜 BSC Davangere Format (Uploaded Sample)
            </button>
            <button
              onClick={() => setViewFormat('MODERN_EXECUTIVE')}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                viewFormat === 'MODERN_EXECUTIVE'
                  ? 'bg-white text-[#722F37] shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              👔 Executive Form T Format
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setUnmaskAccount(!unmaskAccount)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-1.5 transition-colors"
              title={unmaskAccount ? 'Mask Bank Account' : 'Reveal Full Bank Account'}
            >
              {unmaskAccount ? <EyeOff className="w-3.5 h-3.5 text-slate-500" /> : <Eye className="w-3.5 h-3.5 text-slate-500" />}
              <span>{unmaskAccount ? 'Mask Account' : 'Reveal Account'}</span>
            </button>

            <button
              onClick={handleCopySummary}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-1.5 transition-colors"
              title="Copy Summary"
            >
              <Copy className="w-3.5 h-3.5 text-slate-500" />
              <span>Copy</span>
            </button>

            {onEdit && (
              <button
                onClick={onEdit}
                className="px-3 py-1.5 rounded-lg border border-[#722F37]/30 bg-[#722F37]/5 text-[#722F37] font-semibold hover:bg-[#722F37]/10 flex items-center gap-1.5 transition-colors"
              >
                <Edit className="w-3.5 h-3.5" />
                <span>Edit Components</span>
              </button>
            )}

            {onSendEmail && (
              <button
                onClick={onSendEmail}
                className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-1.5 transition-colors"
              >
                <Mail className="w-3.5 h-3.5 text-slate-500" />
                <span>Email</span>
              </button>
            )}

            <button
              onClick={handlePrint}
              className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-bold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Printer className="w-3.5 h-3.5 text-slate-700" />
              <span>Print (A4)</span>
            </button>

            {onDownloadPdf && (
              <button
                onClick={onDownloadPdf}
                className="px-4 py-1.5 rounded-lg bg-[#722F37] hover:bg-[#5B232A] text-white font-bold flex items-center gap-1.5 shadow-xs transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download PDF</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 1. AUTHENTIC BSC DAVANGERE FORMAT (MATCHING THE UPLOADED PHOTO) */}
      {/* ------------------------------------------------------------- */}
      {viewFormat === 'AUTHENTIC_BSC' ? (
        <div
          id="printable-payslip"
          className="print-container bg-white text-black p-8 sm:p-10 rounded-xl border border-slate-300 shadow-sm mx-auto font-mono text-[13px] leading-relaxed select-text"
          style={{ maxWidth: '820px' }}
        >
          {/* COMPANY HEADER WITH DASHED BORDER */}
          <div className="border border-dashed border-black p-3 text-center mb-2">
            <div className="font-bold text-[15px] tracking-wide">BSC TEXTILES PVT LTD.,</div>
            <div className="text-[12px] uppercase">DENTAL COLLEGE ROAD,, DAVANGERE - 577004</div>
            <div className="font-semibold text-[13px] mt-0.5">salary for the Month of {monthStr}-{yearStr}</div>
          </div>

          {/* EMPLOYEE PARTICULARS BOX WITH DASHED BORDER */}
          <div className="border border-dashed border-black p-3 mb-2 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-[12.5px]">
            {/* Col 1 */}
            <div className="space-y-1">
              <div className="flex">
                <span className="w-32 font-bold shrink-0">NAME</span>
                <span className="shrink-0 mr-2">:</span>
                <span className="font-semibold uppercase truncate">{p.fullName}</span>
              </div>
              <div className="flex">
                <span className="w-32 font-bold shrink-0">PF NO</span>
                <span className="shrink-0 mr-2">:</span>
                <span>{p.pfNo || 'N/A'}</span>
              </div>
              <div className="flex">
                <span className="w-32 font-bold shrink-0">EMP.NO</span>
                <span className="shrink-0 mr-2">:</span>
                <span className="font-semibold">{p.employeeCode}</span>
              </div>
              <div className="flex">
                <span className="w-32 font-bold shrink-0">BANK NAME</span>
                <span className="shrink-0 mr-2">:</span>
                <span>{p.bankName || 'HDFC'}</span>
              </div>
              <div className="flex">
                <span className="w-32 font-bold shrink-0">SALESMAN NO</span>
                <span className="shrink-0 mr-2">:</span>
                <span>{p.salesmanNo || p.employeeCode}</span>
              </div>
              <div className="flex">
                <span className="w-32 font-bold shrink-0">SECTION</span>
                <span className="shrink-0 mr-2">:</span>
                <span className="uppercase">{p.section || p.departmentName || 'KIDS'}</span>
              </div>
              <div className="flex">
                <span className="w-32 font-bold shrink-0">SHIFT</span>
                <span className="shrink-0 mr-2">:</span>
                <span>{p.shift || 'SHIFT II'}</span>
              </div>
              <div className="flex">
                <span className="w-32 font-bold shrink-0">PF PAY</span>
                <span className="shrink-0 mr-2">:</span>
                <span>{formatCurr(p.pfPay || p.basicSalary || 12000.00)}</span>
              </div>
              <div className="flex">
                <span className="w-32 font-bold shrink-0">HRA</span>
                <span className="shrink-0 mr-2">:</span>
                <span>{formatCurr(p.hra || 4000.00)}</span>
              </div>
              <div className="flex">
                <span className="w-32 font-bold shrink-0">GROSS SALARY</span>
                <span className="shrink-0 mr-2">:</span>
                <span>{formatCurr(p.fixedGrossSalary || 16000.00)}</span>
              </div>
            </div>

            {/* Col 2 */}
            <div className="space-y-1">
              <div className="flex invisible md:visible h-5 md:h-auto">
                <span className="w-36 font-bold shrink-0">&nbsp;</span>
              </div>
              <div className="flex">
                <span className="w-36 font-bold shrink-0">ESI NO</span>
                <span className="shrink-0 mr-2">:</span>
                <span>{p.esiNo || 'N/A'}</span>
              </div>
              <div className="flex">
                <span className="w-36 font-bold shrink-0">UAN NO</span>
                <span className="shrink-0 mr-2">:</span>
                <span>{p.uanNo || 'N/A'}</span>
              </div>
              <div className="flex">
                <span className="w-36 font-bold shrink-0">ACCOUNT</span>
                <span className="shrink-0 mr-2">:</span>
                <span className="font-mono tracking-wider">{displayAccount}</span>
              </div>
              <div className="flex">
                <span className="w-36 font-bold shrink-0">&nbsp;</span>
              </div>
              <div className="flex">
                <span className="w-36 font-bold shrink-0">LOCATION</span>
                <span className="shrink-0 mr-2">:</span>
                <span className="font-semibold uppercase">{p.locationCode || 'BSCTEX'}</span>
              </div>
              <div className="flex">
                <span className="w-36 font-bold shrink-0">BATCH</span>
                <span className="shrink-0 mr-2">:</span>
                <span>{p.batch || p.shift || 'SHIFT II'}</span>
              </div>
              <div className="flex">
                <span className="w-36 font-bold shrink-0">PER DAY SALARY</span>
                <span className="shrink-0 mr-2">:</span>
                <span>{formatCurr(p.perDaySalary || 516.13)}</span>
              </div>
              <div className="flex">
                <span className="w-36 font-bold shrink-0">DAYS PAYABLE</span>
                <span className="shrink-0 mr-2">:</span>
                <span className="font-bold">{formatCurr(p.daysPayable || 31.00)}</span>
              </div>
            </div>
          </div>

          {/* DUAL TABLE: EARNINGS & DEDUCTIONS WITH DASHED BORDERS */}
          <div className="border border-dashed border-black mb-2">
            {/* Table Header */}
            <div className="grid grid-cols-2 border-b border-dashed border-black text-[12px] font-bold py-1 px-3">
              <div className="flex justify-between pr-4">
                <span>EARNINGS</span>
                <span>CURRENT MONTH</span>
              </div>
              <div className="flex justify-between pl-4 border-l border-dashed border-black">
                <span>DEDUCTIONS</span>
                <span>CURRENT MONTH</span>
              </div>
            </div>

            {/* Line Items */}
            <div className="grid grid-cols-2 text-[12.5px]">
              {/* Left Column: Earnings */}
              <div className="p-3 pr-4 space-y-1.5">
                {earnings.map((e, idx) => (
                  <div key={idx} className="flex justify-between items-center">
                    <span className="font-bold">{e.label}</span>
                    <div className="flex items-center">
                      <span className="mr-2">:</span>
                      <span className="w-24 text-right font-mono">{formatCurr(e.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Right Column: Deductions */}
              <div className="p-3 pl-4 border-l border-dashed border-black space-y-1.5">
                {deductions.map((d, idx) => (
                  <div key={idx} className="flex justify-between items-center">
                    <span className="font-bold">{d.label}</span>
                    <div className="flex items-center">
                      <span className="mr-2">:</span>
                      <span className="w-24 text-right font-mono">{formatCurr(d.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sub-Total Strip: GROSS SALARY & GROSS DEDUCTIONS */}
            <div className="grid grid-cols-2 border-t border-b border-dashed border-black py-1.5 px-3 font-bold text-[12.5px]">
              <div className="flex justify-between items-center pr-4">
                <span>GROSS SALARY</span>
                <div className="flex items-center">
                  <span className="mr-2">:</span>
                  <span className="w-24 text-right font-mono">{formatCurr(grossSalary)}</span>
                </div>
              </div>
              <div className="flex justify-between items-center pl-4 border-l border-dashed border-black">
                <span>GROSS DEDUCTIONS</span>
                <div className="flex items-center">
                  <span className="mr-2">:</span>
                  <span className="w-24 text-right font-mono">{formatCurr(totalDeductions)}</span>
                </div>
              </div>
            </div>

            {/* Total Payable & Advances Strip */}
            <div className="grid grid-cols-2 border-b border-dashed border-black py-1.5 px-3 text-[12.5px]">
              <div className="flex justify-between items-center pr-4 font-bold">
                <span>TOTAL PAYABLE</span>
                <div className="flex items-center">
                  <span className="mr-2">:</span>
                  <span className="w-24 text-right font-mono">{formatCurr(totalPayable)}</span>
                </div>
              </div>
              <div className="pl-4 border-l border-dashed border-black space-y-1">
                <div className="flex justify-between items-center">
                  <span className="font-bold">SALARY ADVANCE</span>
                  <div className="flex items-center">
                    <span className="mr-2">:</span>
                    <span className="w-24 text-right font-mono">{formatCurr(p.salaryAdvance || 0)}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-bold">LOAN ADVANCE</span>
                  <div className="flex items-center">
                    <span className="mr-2">:</span>
                    <span className="w-24 text-right font-mono">{formatCurr(p.loanAdvance || 0)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Net Payable Highlighted Strip */}
            <div className="p-2 px-3 text-[13px] font-bold flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-4">
                <span>NET PAYABLE</span>
                <span>:</span>
                <span className="text-[14px] font-mono tracking-wide">{formatCurr(netPayable)}</span>
              </div>
              <div className="text-[11px] text-slate-500 font-normal italic">
                (Transferred via {p.bankName || 'HDFC'})
              </div>
            </div>
          </div>

          {/* EMPLOYER CONTRIBUTION & CTC BOX */}
          <div className="border border-dashed border-black p-3 mb-2 text-[12.5px] max-w-sm">
            <div className="flex justify-between items-center mb-1">
              <span className="font-bold">EMPLOYER PF</span>
              <div className="flex items-center">
                <span className="mr-2">:</span>
                <span className="w-24 text-right font-mono">{formatCurr(employerPf)}</span>
              </div>
            </div>
            <div className="flex justify-between items-center mb-1.5">
              <span className="font-bold">EMPLOYER ESI</span>
              <div className="flex items-center">
                <span className="mr-2">:</span>
                <span className="w-24 text-right font-mono">{formatCurr(employerEsi)}</span>
              </div>
            </div>
            <div className="border-t border-dashed border-black pt-1 flex justify-between items-center font-bold">
              <span>CTC</span>
              <div className="flex items-center">
                <span className="mr-2">:</span>
                <span className="w-24 text-right font-mono text-[13px]">{formatCurr(ctc)}</span>
              </div>
            </div>
          </div>

          {/* IN WORDS & FOOTER NOTES */}
          <div className="pt-2 text-[11px] text-slate-700 space-y-1">
            <div>
              <span className="font-bold">Amount in Words: </span>
              <span className="italic">{numberToWordsINR(netPayable)}</span>
            </div>
            {p.remarks && (
              <div className="bg-amber-50/70 p-1.5 border border-dashed border-amber-300 rounded text-amber-900">
                <span className="font-bold">HR Remarks: </span>
                <span>{p.remarks}</span>
              </div>
            )}
            <div className="text-[10px] text-slate-500 pt-2 border-t border-dashed border-slate-300 text-center">
              Computer-generated Statutory Wage Slip under Karnataka Shops & Commercial Establishments Act. BSC Textiles Pvt. Ltd.
            </div>
          </div>
        </div>
      ) : (
        /* ------------------------------------------------------------- */
        /* 2. EXECUTIVE MODERN FORM T FORMAT                            */
        /* ------------------------------------------------------------- */
        <div
          id="printable-payslip"
          className="print-container bg-white text-slate-900 p-8 sm:p-10 rounded-2xl border border-slate-200 shadow-md mx-auto font-sans select-text"
          style={{ maxWidth: '820px' }}
        >
          {/* Header */}
          <div className="flex justify-between items-start pb-5 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="w-6 h-6 text-[#722F37]" />
                <h2 className="text-xl font-extrabold text-[#722F37] tracking-tight">BSC TEXTILES PVT. LTD.</h2>
              </div>
              <p className="text-xs text-slate-500">DENTAL COLLEGE ROAD,, DAVANGERE - 577004</p>
              <p className="text-[11px] text-slate-400">Hub / Showroom: {p.locationName || 'Davanagere Mega Store'}</p>
            </div>
            <div className="text-right">
              <span className="inline-block px-3 py-1 bg-[#722F37]/10 text-[#722F37] font-bold text-xs rounded-full uppercase tracking-wider mb-1">
                Form T Payslip
              </span>
              <p className="text-sm font-bold text-slate-800">{monthStr} {yearStr}</p>
              <p className="text-[10px] text-slate-400">Generated: {new Date().toLocaleDateString('en-IN')}</p>
            </div>
          </div>

          {/* Employee Info Grid */}
          <div className="my-5 p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Employee Name</span>
              <span className="font-bold text-slate-900">{p.fullName}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Employee ID</span>
              <span className="font-mono font-bold text-[#722F37]">{p.employeeCode}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">PF Number</span>
              <span className="font-mono">{p.pfNo || 'N/A'}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">ESI Number</span>
              <span className="font-mono">{p.esiNo || 'N/A'}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Bank & Account</span>
              <span className="font-medium">{p.bankName || 'HDFC'} • {displayAccount}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Department / Section</span>
              <span>{p.section || p.departmentName || 'KIDS'}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Shift / Batch</span>
              <span>{p.shift || 'SHIFT II'}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Payable Days</span>
              <span className="font-bold text-slate-900">{p.daysPayable || 31} Days</span>
            </div>
          </div>

          {/* Tables */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5 text-xs">
            {/* Earnings */}
            <div className="border border-emerald-100 rounded-xl overflow-hidden bg-emerald-50/20">
              <div className="bg-emerald-600 text-white px-3 py-2 font-bold flex justify-between">
                <span>EARNINGS & ALLOWANCES</span>
                <span>AMOUNT (₹)</span>
              </div>
              <div className="p-3 space-y-2">
                {earnings.map((e, idx) => (
                  <div key={idx} className="flex justify-between items-center text-slate-700">
                    <span>{e.label}</span>
                    <span className="font-mono font-semibold">₹{formatCurr(e.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="p-2.5 bg-emerald-100/60 border-t border-emerald-200 font-bold flex justify-between text-emerald-950">
                <span>TOTAL GROSS EARNINGS</span>
                <span className="font-mono text-sm">₹{formatCurr(grossSalary)}</span>
              </div>
            </div>

            {/* Deductions */}
            <div className="border border-rose-100 rounded-xl overflow-hidden bg-rose-50/20">
              <div className="bg-rose-600 text-white px-3 py-2 font-bold flex justify-between">
                <span>STATUTORY DEDUCTIONS</span>
                <span>AMOUNT (₹)</span>
              </div>
              <div className="p-3 space-y-2">
                {deductions.map((d, idx) => (
                  <div key={idx} className="flex justify-between items-center text-slate-700">
                    <span>{d.label}</span>
                    <span className="font-mono font-semibold">₹{formatCurr(d.amount)}</span>
                  </div>
                ))}
                {Number(p.salaryAdvance || 0) > 0 && (
                  <div className="flex justify-between items-center text-slate-700">
                    <span>SALARY ADVANCE</span>
                    <span className="font-mono font-semibold">₹{formatCurr(p.salaryAdvance || 0)}</span>
                  </div>
                )}
                {Number(p.loanAdvance || 0) > 0 && (
                  <div className="flex justify-between items-center text-slate-700">
                    <span>LOAN ADVANCE</span>
                    <span className="font-mono font-semibold">₹{formatCurr(p.loanAdvance || 0)}</span>
                  </div>
                )}
              </div>
              <div className="p-2.5 bg-rose-100/60 border-t border-rose-200 font-bold flex justify-between text-rose-950">
                <span>TOTAL DEDUCTIONS</span>
                <span className="font-mono text-sm">₹{formatCurr(totalDeductions)}</span>
              </div>
            </div>
          </div>

          {/* Net Pay Callout */}
          <div className="bg-[#722F37] text-white p-4 rounded-xl flex items-center justify-between mb-5 shadow-sm">
            <div>
              <span className="text-[11px] uppercase tracking-wider text-amber-200 font-bold block">Net Take-Home Pay</span>
              <span className="text-xs text-white/80">{numberToWordsINR(netPayable)}</span>
            </div>
            <div className="text-2xl font-mono font-bold">₹{formatCurr(netPayable)}</div>
          </div>

          {/* Employer Contributions & CTC */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-4 text-xs mb-3">
            <div className="flex items-center gap-6">
              <div>
                <span className="text-[10px] text-slate-400 block font-bold uppercase">Employer PF (12%)</span>
                <span className="font-mono font-semibold text-slate-800">₹{formatCurr(employerPf)}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-bold uppercase">Employer ESI (3.25%)</span>
                <span className="font-mono font-semibold text-slate-800">₹{formatCurr(employerEsi)}</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-[#722F37] block font-bold uppercase">Cost to Company (CTC)</span>
              <span className="font-mono font-bold text-base text-[#722F37]">₹{formatCurr(ctc)}</span>
            </div>
          </div>

          {p.remarks && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 mb-3">
              <strong>Authorized Note:</strong> {p.remarks}
            </div>
          )}

          {/* Footer */}
          <div className="pt-4 border-t border-slate-200 text-[11px] text-slate-400 flex justify-between items-center">
            <span>Authorized by BSC Textiles Human Resources Directorate</span>
            <span>Document ID: {p.id}</span>
          </div>
        </div>
      )}

      {/* PRINT CSS STYLES INJECTED FOR PRINTERS */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-payslip,
          #printable-payslip * {
            visibility: visible;
          }
          #printable-payslip {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            max-width: 100% !important;
            padding: 15mm !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: 1px dashed #000 !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
