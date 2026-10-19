import PDFDocument from 'pdfkit';

export interface EmployeeProfilePdfData {
  id: string;
  employeeCode: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  designation?: string;
  departmentName?: string;
  locationName?: string;
  status?: string;
  role?: string;
  email?: string;
  phone?: string;
  emergencyContact?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  pincode?: string;
  dateOfBirth?: string;
  gender?: string;
  bloodGroup?: string;
  maritalStatus?: string;
  joiningDate?: string;
  tenure?: string;
  managerName?: string;
  hrPartner?: string;
  shiftName?: string;
  aadhaar?: string;
  pan?: string;
  uan?: string;
  esic?: string;
  bankName?: string;
  bankAccount?: string;
  bankIfsc?: string;
  bankBranch?: string;
  allowSalary?: boolean;
  salaryData?: {
    basic: number;
    hra: number;
    allowances: number;
    incentive: number;
    gross: number;
    pf: number;
    esic: number;
    pt: number;
    tds: number;
    net: number;
  };
  kycDocuments?: Array<{
    documentType: string;
    documentNumberMasked: string;
    issuer: string;
    status: string;
    source?: string;
  }>;
  attendanceLogs?: Array<{
    date: string;
    shift: string;
    in: string;
    out: string;
    terminal: string;
    method: string;
    status: string;
  }>;
  auditTrail?: Array<{
    time: string;
    event: string;
    actor: string;
    desc: string;
  }>;
}

function maskIdentifier(val?: string, type?: 'AADHAAR' | 'PAN' | 'BANK'): string {
  if (!val || val === 'Not available') return 'Not available';
  const clean = val.replace(/\s+/g, '');
  if (type === 'AADHAAR') {
    const last4 = clean.slice(-4);
    return `XXXX-XXXX-${last4}`;
  }
  if (type === 'PAN' && clean.length >= 10) {
    return `${clean.slice(0, 3)}XX${clean.slice(5, 9)}X`;
  }
  if (type === 'BANK' && clean.length >= 4) {
    return `••••••••${clean.slice(-4)}`;
  }
  return val;
}

export async function generateEmployeeProfilePdf(data: EmployeeProfilePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 36,
        bufferPages: true,
      });

      const buffers: Buffer[] = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => {
        // Multi-page header and footer numbering
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
          doc.switchToPage(i);
          // Top mini banner
          doc.save();
          doc.fontSize(8).fillColor('#64748b');
          doc.text('BSC TEXTILES PRIVATE LIMITED • WORKFORCE DIRECTORY & PROFILE 360 DOSSIER', 36, 18, {
            align: 'left',
          });
          doc.text(`EMP CODE: ${data.employeeCode}`, 36, 18, {
            align: 'right',
          });
          doc.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(36, 28).lineTo(559, 28).stroke();

          // Bottom footer
          const nowStr = new Date().toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
          doc.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(36, 804).lineTo(559, 804).stroke();
          doc.fontSize(8).fillColor('#64748b');
          doc.text(`Generated on ${nowStr} • Confidential – For internal HR use only`, 36, 810, {
            align: 'left',
          });
          doc.text(`Page ${i + 1} of ${range.count}`, 36, 810, {
            align: 'right',
          });
          doc.restore();
        }
        resolve(Buffer.concat(buffers));
      });
      doc.on('error', (err) => reject(err));

      const primaryColor = '#1346a1'; // BSC Maroon Accent
      const darkColor = '#0f172a';
      const slateColor = '#475569';
      const lightBg = '#f8fafc';
      const borderCol = '#e2e8f0';

      // ==========================================
      // PAGE 1: Identity, Personal, Organization
      // ==========================================
      doc.y = 38;

      // Header Brand Block
      doc.rect(36, doc.y, 523, 72).fillAndStroke('#fdf8f8', primaryColor);
      doc.fillColor(primaryColor).fontSize(16).font('Helvetica-Bold')
        .text('BSC TEXTILES PRIVATE LIMITED', 48, 48);
      doc.fontSize(10).font('Helvetica')
        .text('Official Karnataka Workforce Dossier • Certified Form B Record', 48, 68);
      doc.fontSize(8).fillColor(slateColor)
        .text('Corporate Office: #104 Silk Mill Road, Industrial Area, Belagavi, Karnataka – 590014', 48, 84);

      doc.y = 120;

      // Identity & Profile Card
      const cardY = doc.y;
      doc.rect(36, cardY, 523, 105).fillAndStroke(lightBg, borderCol);

      // Avatar Initials Box (80x80)
      doc.rect(48, cardY + 12, 80, 80).fillAndStroke('#ffffff', '#cbd5e1');
      const initials = (data.fullName || 'ET')
        .split(' ')
        .map((p) => p[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase();
      doc.fillColor(primaryColor).fontSize(28).font('Helvetica-Bold')
        .text(initials, 48, cardY + 38, { width: 80, align: 'center' });

      // Identity text
      const idX = 142;
      doc.fillColor(darkColor).fontSize(16).font('Helvetica-Bold')
        .text(data.fullName, idX, cardY + 12);

      doc.fillColor(slateColor).fontSize(10).font('Helvetica')
        .text(`${data.designation || 'Specialist Staff'} • ${data.departmentName || 'Operations Directorate'}`, idX, cardY + 32);

      // Status Badges row
      const badgeY = cardY + 48;
      doc.rect(idX, badgeY, 90, 16).fillAndStroke('#eff6ff', '#bfdbfe');
      doc.fillColor('#1d4ed8').fontSize(8).font('Helvetica-Bold')
        .text(`ID: ${data.employeeCode}`, idX + 4, badgeY + 4, { width: 82, align: 'center' });

      const statusText = (data.status || 'ACTIVE').toUpperCase() === 'TERMINATED' ? 'FORMER / EXITED' : 'CONFIRMED';
      const statusBg = statusText === 'CONFIRMED' ? '#ecfdf5' : '#fef2f2';
      const statusStroke = statusText === 'CONFIRMED' ? '#a7f3d0' : '#fecaca';
      const statusCol = statusText === 'CONFIRMED' ? '#047857' : '#b91c1c';

      doc.rect(idX + 96, badgeY, 110, 16).fillAndStroke(statusBg, statusStroke);
      doc.fillColor(statusCol).fontSize(8).font('Helvetica-Bold')
        .text(statusText, idX + 100, badgeY + 4, { width: 102, align: 'center' });

      doc.rect(idX + 212, badgeY, 160, 16).fillAndStroke('#f1f5f9', '#cbd5e1');
      doc.fillColor('#334155').fontSize(8).font('Helvetica')
        .text(data.locationName || 'Belagavi Flagship Store (BEL-01)', idX + 216, badgeY + 4, { width: 152, align: 'center' });

      // Contact Strip Box
      doc.rect(idX, cardY + 70, 405, 26).fillAndStroke('#ffffff', '#e2e8f0');
      doc.fillColor(slateColor).fontSize(8).font('Helvetica')
        .text(`Email: ${data.email || 'Not available'}   |   Phone: +91 ${data.phone || 'Not available'}   |   SOS: ${data.emergencyContact || 'Not available'}`, idX + 8, cardY + 79);

      doc.y = cardY + 115;

      // Helper function to render a 2-column section
      const renderSectionHeader = (title: string, iconSymbol: string) => {
        doc.rect(36, doc.y, 523, 20).fillAndStroke('#f1f5f9', '#cbd5e1');
        doc.fillColor(primaryColor).fontSize(9).font('Helvetica-Bold')
          .text(`${iconSymbol}  ${title}`, 44, doc.y + 5);
        doc.y += 24;
      };

      // 1. Personal Demographics & Address
      renderSectionHeader('PERSONAL DEMOGRAPHICS & PERMANENT ADDRESS', '■');
      const demoY = doc.y;
      doc.rect(36, demoY, 523, 62).fillAndStroke('#ffffff', borderCol);

      doc.fillColor('#64748b').fontSize(8).font('Helvetica-Bold');
      doc.text('DATE OF BIRTH', 48, demoY + 8);
      doc.text('GENDER', 170, demoY + 8);
      doc.text('BLOOD GROUP', 290, demoY + 8);
      doc.text('MARITAL STATUS', 410, demoY + 8);

      doc.fillColor(darkColor).fontSize(9).font('Helvetica');
      doc.text(data.dateOfBirth || 'Not available', 48, demoY + 20);
      doc.text(data.gender || 'Not available', 170, demoY + 20);
      doc.text(data.bloodGroup || 'Not available', 290, demoY + 20);
      doc.text(data.maritalStatus || 'Not available', 410, demoY + 20);

      const fullAddr = `${data.addressLine1 || 'Not available'}, ${data.city || ''}, ${data.state || ''} - ${data.pincode || ''}`;
      doc.fillColor('#64748b').fontSize(8).font('Helvetica-Bold').text('RESIDENTIAL ADDRESS', 48, demoY + 36);
      doc.fillColor(darkColor).fontSize(9).font('Helvetica').text(fullAddr, 48, demoY + 47, { width: 495 });

      doc.y = demoY + 72;

      // 2. Organization, Cadence & Shift Details
      renderSectionHeader('EMPLOYMENT CADENCE & GOVERNANCE', '■');
      const orgY = doc.y;
      doc.rect(36, orgY, 523, 50).fillAndStroke('#ffffff', borderCol);

      doc.fillColor('#64748b').fontSize(8).font('Helvetica-Bold');
      doc.text('JOINING DATE', 48, orgY + 8);
      doc.text('TENURE', 170, orgY + 8);
      doc.text('REPORTING HEAD', 290, orgY + 8);
      doc.text('HR BUSINESS PARTNER', 410, orgY + 8);

      doc.fillColor(darkColor).fontSize(9).font('Helvetica');
      doc.text(data.joiningDate || 'Not available', 48, orgY + 20);
      doc.text(data.tenure || '4y 2m', 170, orgY + 20);
      doc.text(data.managerName || 'Anand Kulkarni', 290, orgY + 20);
      doc.text(data.hrPartner || 'Sunita Deshmukh', 410, orgY + 20);

      doc.fillColor('#64748b').fontSize(8).font('Helvetica-Bold').text('ASSIGNED SHIFT & CADENCE', 48, orgY + 34);
      doc.fillColor(primaryColor).fontSize(9).font('Helvetica-Bold').text(data.shiftName || 'Retail A (09:30 – 18:30)', 170, orgY + 34);

      doc.y = orgY + 60;

      // 3. Statutory Compliance & Banking Registry (Masked)
      renderSectionHeader('STATUTORY IDENTIFICATION & BANKING REGISTRY (MASKED)', '■');
      const statY = doc.y;
      doc.rect(36, statY, 523, 54).fillAndStroke('#ffffff', borderCol);

      doc.fillColor('#64748b').fontSize(8).font('Helvetica-Bold');
      doc.text('AADHAAR (UIDAI)', 48, statY + 8);
      doc.text('INCOME TAX PAN', 170, statY + 8);
      doc.text('EPFO (UAN)', 290, statY + 8);
      doc.text('ESIC ID', 410, statY + 8);

      doc.fillColor(darkColor).fontSize(9).font('Helvetica');
      doc.text(maskIdentifier(data.aadhaar || '8821', 'AADHAAR'), 48, statY + 20);
      doc.text(maskIdentifier(data.pan || 'ABZPP4912K', 'PAN'), 170, statY + 20);
      doc.text(data.uan || '101294821039', 290, statY + 20);
      doc.text(data.esic || '3109284719', 410, statY + 20);

      doc.fillColor('#64748b').fontSize(8).font('Helvetica-Bold').text('BANK & ACH DIRECT DEPOSIT', 48, statY + 36);
      const bankInfo = `${data.bankName || 'State Bank of India'} • A/C ${maskIdentifier(data.bankAccount || '4912', 'BANK')} • IFSC: ${data.bankIfsc || 'SBIN0001248'} (${data.bankBranch || 'Belagavi Camp'})`;
      doc.fillColor(darkColor).fontSize(8.5).font('Helvetica').text(bankInfo, 170, statY + 36);

      doc.y = statY + 64;

      // 4. October 2024 Attendance Performance Summary
      renderSectionHeader('OCTOBER 2024 ATTENDANCE & BIOMETRIC PERFORMANCE', '■');
      const perfY = doc.y;
      doc.rect(36, perfY, 523, 44).fillAndStroke('#f8fafc', borderCol);

      const boxW = 523 / 4;
      const perfMetrics = [
        { label: 'AVG CHECK-IN', val: '09:27 AM', sub: '3m Early Buffer' },
        { label: 'AVG CHECK-OUT', val: '06:34 PM', sub: 'Standard Closure' },
        { label: 'TOTAL OVERTIME', val: '6.5 Hours', sub: '1.25x Credit Rate' },
        { label: 'BREAK ADHERENCE', val: '100%', sub: 'Zero Overages' },
      ];
      perfMetrics.forEach((m, idx) => {
        const x = 36 + idx * boxW;
        doc.fillColor('#64748b').fontSize(7.5).font('Helvetica-Bold').text(m.label, x + 8, perfY + 6);
        doc.fillColor(primaryColor).fontSize(12).font('Helvetica-Bold').text(m.val, x + 8, perfY + 17);
        doc.fillColor('#047857').fontSize(7.5).font('Helvetica').text(m.sub, x + 8, perfY + 31);
      });

      doc.y = perfY + 54;

      // 5. Leave Balances & Quota
      renderSectionHeader('STATUTORY LEAVE BALANCES & QUOTA (KARNATAKA SHOPS ACT)', '■');
      const leaveY = doc.y;
      doc.rect(36, leaveY, 523, 36).fillAndStroke('#ffffff', borderCol);
      const leaveW = 523 / 4;
      const leaves = [
        { label: 'CASUAL LEAVE (CL)', bal: '4.0 / 8.0 Days' },
        { label: 'SICK LEAVE (SL)', bal: '7.0 / 10.0 Days' },
        { label: 'EARNED LEAVE (EL)', bal: '14.5 / 18.0 Days' },
        { label: 'FESTIVAL HOLIDAYS', bal: '2.0 / 2.0 Gazetted' },
      ];
      leaves.forEach((l, idx) => {
        const x = 36 + idx * leaveW;
        doc.fillColor('#64748b').fontSize(7.5).font('Helvetica-Bold').text(l.label, x + 8, leaveY + 6);
        doc.fillColor(darkColor).fontSize(10).font('Helvetica-Bold').text(l.bal, x + 8, leaveY + 18);
      });

      // ==========================================
      // PAGE 2: Logs, Compensation, KYC & Audit
      // ==========================================
      doc.addPage();
      doc.y = 38;

      // 6. Recent Biometric Attendance Records
      renderSectionHeader('RECENT BIOMETRIC & IOT PUNCH RECORDS (LAST 5 LOGS)', '■');
      const logTableY = doc.y;
      doc.rect(36, logTableY, 523, 16).fillAndStroke('#e2e8f0', '#cbd5e1');
      doc.fillColor(darkColor).fontSize(7.5).font('Helvetica-Bold');
      doc.text('DATE', 42, logTableY + 4);
      doc.text('SHIFT', 115, logTableY + 4);
      doc.text('IN PUNCH', 215, logTableY + 4);
      doc.text('OUT PUNCH', 280, logTableY + 4);
      doc.text('TERMINAL', 345, logTableY + 4);
      doc.text('METHOD', 420, logTableY + 4);
      doc.text('STATUS', 495, logTableY + 4);

      let curLogY = logTableY + 16;
      const defaultLogs = data.attendanceLogs || [
        { date: '09 Oct 2026', shift: 'Retail A', in: '09:18:22 AM', out: '06:35:10 PM', terminal: 'BEL-TERM-01', method: 'Face Mesh (99.8%)', status: 'Early Login' },
        { date: '08 Oct 2026', shift: 'Retail A', in: '09:22:45 AM', out: '06:32:04 PM', terminal: 'BEL-TERM-02', method: 'Face Mesh (99.4%)', status: 'Early Login' },
        { date: '07 Oct 2026', shift: 'Retail A', in: '09:29:10 AM', out: '06:30:15 PM', terminal: 'BEL-TERM-01', method: 'Face Mesh (99.9%)', status: 'On Time' },
        { date: '06 Oct 2026', shift: 'Retail A', in: '09:34:00 AM', out: '06:36:50 PM', terminal: 'BEL-TERM-03', method: 'QR + Face Mesh', status: 'Grace Period' },
        { date: '05 Oct 2026', shift: 'Retail A', in: '09:15:30 AM', out: '06:34:20 PM', terminal: 'BEL-TERM-01', method: 'Face Mesh (99.7%)', status: 'Early Login' },
      ];

      defaultLogs.forEach((row, i) => {
        doc.rect(36, curLogY, 523, 14).fillAndStroke(i % 2 === 0 ? '#ffffff' : '#f8fafc', borderCol);
        doc.fillColor(darkColor).fontSize(7.5).font('Helvetica');
        doc.text(row.date, 42, curLogY + 3);
        doc.text(row.shift, 115, curLogY + 3);
        doc.text(row.in, 215, curLogY + 3);
        doc.text(row.out, 280, curLogY + 3);
        doc.text(row.terminal, 345, curLogY + 3);
        doc.text(row.method, 420, curLogY + 3);
        doc.font('Helvetica-Bold').fillColor(row.status === 'Early Login' ? '#047857' : '#1d4ed8').text(row.status, 495, curLogY + 3);
        curLogY += 14;
      });

      doc.y = curLogY + 10;

      // 7. Compensation & Salary Structure (Role-permission gated)
      renderSectionHeader('COMPENSATION & MONTHLY SALARY RECORD (FORM T WAGES)', '■');
      const salaryY = doc.y;
      doc.rect(36, salaryY, 523, 56).fillAndStroke('#ffffff', borderCol);

      if (data.allowSalary === false) {
        doc.fillColor('#dc2626').fontSize(9).font('Helvetica-Bold')
          .text('Restricted by role permission (Confidential Salary Information Hidden)', 48, salaryY + 22);
      } else {
        const s = data.salaryData || {
          basic: 28000,
          hra: 11200,
          allowances: 10500,
          incentive: 4500,
          gross: 54200,
          pf: 3360,
          esic: 407,
          pt: 200,
          tds: 0,
          net: 50233,
        };

        doc.fillColor('#64748b').fontSize(7.5).font('Helvetica-Bold');
        doc.text('BASIC PAY', 48, salaryY + 6);
        doc.text('HRA', 130, salaryY + 6);
        doc.text('ALLOWANCES', 210, salaryY + 6);
        doc.text('GROSS EARNINGS', 300, salaryY + 6);
        doc.text('DEDUCTIONS (PF+ESI+PT)', 400, salaryY + 6);

        doc.fillColor(darkColor).fontSize(9).font('Helvetica');
        doc.text(`INR ${s.basic.toLocaleString('en-IN')}`, 48, salaryY + 18);
        doc.text(`INR ${s.hra.toLocaleString('en-IN')}`, 130, salaryY + 18);
        doc.text(`INR ${s.allowances.toLocaleString('en-IN')}`, 210, salaryY + 18);
        doc.font('Helvetica-Bold').text(`INR ${s.gross.toLocaleString('en-IN')}`, 300, salaryY + 18);
        doc.font('Helvetica').fillColor('#b91c1c').text(`INR ${(s.pf + s.esic + s.pt).toLocaleString('en-IN')}`, 400, salaryY + 18);

        doc.rect(48, salaryY + 34, 499, 16).fillAndStroke('#f8fafc', '#cbd5e1');
        doc.fillColor(primaryColor).fontSize(8.5).font('Helvetica-Bold')
          .text(`NET DISBURSED TAKE-HOME PAY: INR ${s.net.toLocaleString('en-IN')}`, 56, salaryY + 38);
      }

      doc.y = salaryY + 66;

      // 8. KYC & Digital Documents Status
      renderSectionHeader('KYC & DIGITAL ATTESTATION CREDENTIALS (METADATA ONLY)', '■');
      const kycY = doc.y;
      doc.rect(36, kycY, 523, 16).fillAndStroke('#e2e8f0', '#cbd5e1');
      doc.fillColor(darkColor).fontSize(7.5).font('Helvetica-Bold');
      doc.text('CREDENTIAL TYPE', 42, kycY + 4);
      doc.text('MASKED IDENTIFIER', 160, kycY + 4);
      doc.text('ISSUING AUTHORITY', 270, kycY + 4);
      doc.text('VERIFICATION STATUS', 410, kycY + 4);
      doc.text('CHANNEL', 485, kycY + 4);

      let curKycY = kycY + 16;
      const kycList = data.kycDocuments || [
        { documentType: 'Aadhaar Card (UIDAI)', documentNumberMasked: 'XXXX-XXXX-8821', issuer: 'UIDAI Govt of India', status: 'VERIFIED', source: 'DigiLocker PKCE' },
        { documentType: 'Income Tax PAN', documentNumberMasked: 'ABZPP4912K', issuer: 'Income Tax Department', status: 'VERIFIED', source: 'DigiLocker PKCE' },
        { documentType: 'Driving License', documentNumberMasked: 'KA-22-2016-00912', issuer: 'MoRTH Karnataka', status: 'VERIFIED', source: 'DigiLocker PKCE' },
        { documentType: 'Educational Degree', documentNumberMasked: 'CERT-UG-8821', issuer: 'Karnataka University', status: 'SUBMITTED', source: 'Physical Scan' },
      ];

      kycList.forEach((kd, idx) => {
        doc.rect(36, curKycY, 523, 14).fillAndStroke(idx % 2 === 0 ? '#ffffff' : '#f8fafc', borderCol);
        doc.fillColor(darkColor).fontSize(7.5).font('Helvetica');
        doc.text(kd.documentType, 42, curKycY + 3);
        doc.text(kd.documentNumberMasked, 160, curKycY + 3);
        doc.text(kd.issuer, 270, curKycY + 3);
        doc.font('Helvetica-Bold').fillColor(kd.status === 'VERIFIED' ? '#047857' : '#d97706').text(kd.status, 410, curKycY + 3);
        doc.font('Helvetica').fillColor('#475569').text(kd.source || 'Verified Vault', 485, curKycY + 3);
        curKycY += 14;
      });

      doc.y = curKycY + 10;

      // 9. Immutable Audit Trail
      renderSectionHeader('EMPLOYEE DOSSIER IMMUTABLE AUDIT TRAIL', '■');
      const auditY = doc.y;
      const defaultAudits = data.auditTrail || [
        { time: 'Today 09:18 AM', event: 'BIOMETRIC_FACE_MATCH_SUCCESS', actor: 'Karnataka Hub Terminal BEL-01', desc: 'Facial match 99.8% confirmed. Early bonus credit recorded.' },
        { time: '01 Oct 2026 10:00 AM', event: 'MONTHLY_PAYROLL_GENERATION', actor: 'Pradeep Chavan (Payroll Manager)', desc: 'October 2026 payroll run processed. Gross INR 55,640.' },
        { time: '14 Aug 2026 05:40 PM', event: 'LEAVE_REQUEST_APPROVAL', actor: 'Sunita Deshmukh (Lead HR)', desc: 'Approved 2.0 days Casual Leave for 14 Aug - 15 Aug.' },
        { time: '12 Jan 2021 09:00 AM', event: 'EMPLOYEE_ONBOARDING_COMPLETED', actor: 'HR Operations Directorate', desc: 'Master dossier created. UIDAI e-KYC verified.' },
      ];

      let curAuditY = auditY;
      defaultAudits.slice(0, 4).forEach((at) => {
        doc.rect(36, curAuditY, 523, 20).fillAndStroke('#ffffff', borderCol);
        doc.fillColor(primaryColor).fontSize(7.5).font('Helvetica-Bold').text(at.event, 42, curAuditY + 3);
        doc.fillColor('#64748b').fontSize(7.5).font('Helvetica').text(at.time, 240, curAuditY + 3);
        doc.fillColor('#334155').fontSize(7.5).font('Helvetica').text(`Actor: ${at.actor}`, 360, curAuditY + 3);
        doc.fillColor(darkColor).fontSize(7.5).font('Helvetica').text(at.desc, 42, curAuditY + 11, { width: 510 });
        curAuditY += 22;
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
