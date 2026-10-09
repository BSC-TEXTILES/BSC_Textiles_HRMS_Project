/**
 * Shared shift-correction / regularization records.
 *
 * Client-side source of truth for regularization requests (pending, supervisor
 * reviewed, approved, rejected). Used by the Attendance Corrections workflow
 * and surfaced in the Floor Shift Regularization drill-down views.
 */

export interface CorrectionRecord {
  id: string;
  empCode: string;
  name: string;
  role: string;
  hub: string;
  dept: string;
  avatar: string;
  shift: string;
  rawIn: string;
  rawOut: string;
  terminal: string;
  overrideOut: string;
  overrideIn?: string;
  totalHours: string;
  otHours: string;
  reason: string;
  evidence: string;
  invoiceOrDoc?: string;
  supervisor: string;
  pipelineStep: string;
  pipelineTotal: string;
  status: 'PENDING' | 'SUPERVISOR_OK' | 'APPROVED' | 'REJECTED';
  type: 'MISSED_OUT' | 'LATE_GRACE' | 'ON_DUTY' | 'SENSOR_GLITCH';
  notes: string;
}

export const CORRECTION_RECORDS: CorrectionRecord[] = [
  {
    id: 'CORR-4029',
    empCode: 'BSC-EMP-0042',
    name: 'Rajeshwari V. Patil',
    role: 'Senior Floor Specialist',
    hub: 'BEL-01 Flagship',
    dept: 'Bridal Silk & Atelier',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&q=80',
    shift: 'Shift A (09:30 â€“ 18:30)',
    rawIn: '09:28 IN',
    rawOut: 'Missed OUT',
    terminal: 'BEL-IN-02',
    overrideOut: '19:15 OUT',
    totalHours: '9h 47m Total',
    otHours: '+1h 15m Overtime (1.25x)',
    reason: 'VIP Bridal Kanjeevaram Showcase extended handover for royal wedding party.',
    evidence: 'Bill #SLK-8819 (â‚¹3.4L) & CCTV CAM-04 Bridal Vault confirmed presence.',
    invoiceOrDoc: 'Invoice #SLK-8819',
    supervisor: 'Anand Kulkarni (Store Lead)',
    pipelineStep: '2',
    pipelineTotal: '3',
    status: 'PENDING',
    type: 'MISSED_OUT',
    notes: 'Rajeshwari was actively presenting heritage Kanjeevaram sarees to the royal wedding party until 19:10 IST. Card tap missed due to vault register lockdown protocol.',
  },
  {
    id: 'CORR-4030',
    empCode: 'BSC-EMP-0089',
    name: 'Amit Deshpande',
    role: 'Master Tailor',
    hub: 'SHI-03 Apex',
    dept: 'Tailoring & Alterations',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
    shift: 'Shift B (11:30 â€“ 20:30)',
    rawIn: '14:02 IN (Late 2h 32m)',
    rawOut: '20:38 OUT',
    terminal: 'SHI-GATE-01',
    overrideOut: '20:38 OUT',
    overrideIn: 'Half-Day Credit 6.5h',
    totalHours: '6.5h Credited',
    otHours: '0.5 Casual Leave applied',
    reason: 'KSRTC Shivamogga regional bus strike stranded inter-district transit.',
    evidence: 'Official KSRTC Transit Strike Press Release attached.',
    invoiceOrDoc: 'News Bulletin Ref #NB-442',
    supervisor: 'V. Hiremath (Floor Lead)',
    pipelineStep: '2',
    pipelineTotal: '3',
    status: 'SUPERVISOR_OK',
    type: 'LATE_GRACE',
    notes: 'District bus depot strike confirmed by district magistrate notice. Staff communicated delay by telephone at 10:15 AM.',
  },
  {
    id: 'CORR-4031',
    empCode: 'BSC-MGR-0021',
    name: 'Veeranna Pattar',
    role: 'Jacquard Loom Master',
    hub: 'DAV-02 Hub',
    dept: 'Jacquard Loom Yard',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
    shift: 'Shift C Night (20:30 â€“ 05:30)',
    rawIn: 'Sensor Glitch IN',
    rawOut: '05:32 OUT',
    terminal: 'DAV-GATE-01',
    overrideOut: '05:32 OUT',
    overrideIn: '20:25 IN Logged',
    totalHours: '9h 07m Full Shift',
    otHours: '100% Shift Paid',
    reason: 'Terminal turnstile DAV-GATE-01 rebooted during shift transition due to power fluctuation.',
    evidence: 'Security Gate Physical Logbook Entry #318 signed by Sub-Inspector.',
    invoiceOrDoc: 'Gate Pass #GP-882',
    supervisor: 'Security Inspector Patil',
    pipelineStep: '3',
    pipelineTotal: '3',
    status: 'SUPERVISOR_OK',
    type: 'SENSOR_GLITCH',
    notes: 'Optical glass scanner cleaned & system re-initialized at 20:28. Security ledger verifies physical entry timestamp of 20:25 IST.',
  },
  {
    id: 'CORR-4032',
    empCode: 'BSC-EMP-0144',
    name: 'Kavita M.',
    role: 'Cashier & POS Lead',
    hub: 'BEL-01 Flagship',
    dept: 'Cashiering & POS',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80',
    shift: 'Shift A (09:30 â€“ 18:30)',
    rawIn: '09:34 IN',
    rawOut: '13:45 OUT (Premature Tag)',
    terminal: 'BEL-POS-01',
    overrideOut: '18:32 OUT',
    totalHours: '8h 58m Total Shift',
    otHours: 'Break swipe error corrected',
    reason: 'Accidentally scanned exit turnstile reader during lunch interval instead of cafeteria terminal.',
    evidence: 'Vault Cash Handover Register signed at 18:30 IST.',
    invoiceOrDoc: 'Vault Handover #V-102',
    supervisor: 'R. Deshmukh (Cash Head)',
    pipelineStep: '2',
    pipelineTotal: '3',
    status: 'SUPERVISOR_OK',
    type: 'MISSED_OUT',
    notes: 'Cash counter register verifies cash drawer settlement completed at 18:25 PM with zero variance.',
  },
  {
    id: 'CORR-4033',
    empCode: 'BSC-EMP-0094',
    name: 'Rekha Naik',
    role: 'Saree Depot Associate',
    hub: 'BEL-01 Flagship',
    dept: 'Finished Goods Depot',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=200&q=80',
    shift: 'General (09:00 â€“ 18:00)',
    rawIn: '08:58 IN',
    rawOut: 'On-Duty Slip (15:00-19:30)',
    terminal: 'BEL-LOG-01',
    overrideOut: '19:35 OUT DAV',
    totalHours: '10h 37m Net Shift',
    otHours: '+1h 35m Inter-store transfer',
    reason: 'Urgent stock dispatch to Davanagere Mega Store via company transit van.',
    evidence: 'E-Way Bill #EWB-9041 and Gate Delivery Receipt confirmed.',
    invoiceOrDoc: 'Transit Waybill #EWB-9041',
    supervisor: 'G. Kulkarni (Logistics Lead)',
    pipelineStep: '2',
    pipelineTotal: '3',
    status: 'PENDING',
    type: 'ON_DUTY',
    notes: 'Inter-hub saree bundle transfer initiated for festival inventory replenishment. Returned via Davanagere transit corridor.',
  },
  {
    id: 'CORR-4034',
    empCode: 'BSC-EMP-0112',
    name: 'Manjunath Swamy',
    role: 'Visual Merchandiser',
    hub: 'SHI-03 Apex',
    dept: 'Visual Merchandising',
    avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=200&q=80',
    shift: 'Shift B (11:30 â€“ 20:30)',
    rawIn: '11:42 IN (Grace 12m)',
    rawOut: '21:10 OUT',
    terminal: 'SHI-VM-01',
    overrideOut: '21:10 OUT',
    totalHours: '9h 28m Total',
    otHours: '+40m Floor Overtime',
    reason: 'Diwali showcase mannequin styling window rearrangement beyond store hours.',
    evidence: 'Store Manager signoff note & CCTV Front Glass feed verified.',
    invoiceOrDoc: 'VM Window Slip #VM-77',
    supervisor: 'V. Hiremath (Floor Lead)',
    pipelineStep: '3',
    pipelineTotal: '3',
    status: 'APPROVED',
    type: 'LATE_GRACE',
    notes: 'Visual merchandising team required extended window after mall shutter closure at 20:30.',
  },
];
