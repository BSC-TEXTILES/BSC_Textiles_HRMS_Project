import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // 12 staff physically present on floor (5 in Zone A, 4 in Zone B, 3 in Zone C)
  const presentStaff = [
    { id: 'STAFF-01', code: 'EMP-001', name: 'Ramesh Kulkarni', dept: 'Manufacturing (Looms)', zone: 'Zone B - Loom Hall', role: 'Master Weaver', punchIn: '08:45 AM', status: 'PRESENT', terminal: 'BEL-02' },
    { id: 'STAFF-02', code: 'EMP-003', name: 'Kavita Bhat', dept: 'Admin & HR', zone: 'Zone A - Executive Floor', role: 'HR Executive', punchIn: '08:52 AM', status: 'PRESENT', terminal: 'BEL-01' },
    { id: 'STAFF-03', code: 'EMP-004', name: 'Pooja Deshmukh', dept: 'Retail & Showroom', zone: 'Zone A - Retail Front', role: 'Showroom Lead', punchIn: '09:05 AM', status: 'PRESENT', terminal: 'BEL-01' },
    { id: 'STAFF-04', code: 'EMP-007', name: 'Mohammed Irfan', dept: 'Manufacturing (Spinning)', zone: 'Zone B - Loom Hall', role: 'Spinning Operator', punchIn: '09:12 AM', status: 'PRESENT', terminal: 'BEL-02' },
    { id: 'STAFF-05', code: 'EMP-009', name: 'Rajesh Kumar', dept: 'Retail & Showroom', zone: 'Zone A - Retail Front', role: 'Senior Sales Exec', punchIn: '09:15 AM', status: 'PRESENT', terminal: 'BEL-01' },
    { id: 'STAFF-06', code: 'EMP-011', name: 'Amit Patel', dept: 'Manufacturing (QC)', zone: 'Zone B - Quality Testing', role: 'QC Floor Manager', punchIn: '08:30 AM', status: 'PRESENT', terminal: 'BEL-02' },
    { id: 'STAFF-07', code: 'EMP-014', name: 'Sunita Rao', dept: 'Retail & Showroom', zone: 'Zone C - Billing Desk', role: 'Cashier / POS', punchIn: '09:33 AM', status: 'PRESENT', terminal: 'BEL-03' },
    { id: 'STAFF-08', code: 'EMP-016', name: 'Lakshmi Hegde', dept: 'Manufacturing (Finishing)', zone: 'Zone B - Loom Hall', role: 'Finishing Tech', punchIn: '09:00 AM', status: 'PRESENT', terminal: 'BEL-02' },
    { id: 'STAFF-09', code: 'EMP-018', name: 'Vijay Kamath', dept: 'Admin & HR', zone: 'Zone A - Executive Floor', role: 'Accounts Officer', punchIn: '09:10 AM', status: 'PRESENT', terminal: 'BEL-01' },
    { id: 'STAFF-10', code: 'EMP-020', name: 'Divya Reddy', dept: 'Security & Facilities', zone: 'Zone C - Gate & Security', role: 'Security Supervisor', punchIn: '07:55 AM', status: 'PRESENT', terminal: 'BEL-03' },
    { id: 'STAFF-11', code: 'EMP-023', name: 'Chetan Joshi', dept: 'Security & Facilities', zone: 'Zone C - Gate & Security', role: 'CCTV Operator', punchIn: '08:00 AM', status: 'PRESENT', terminal: 'BEL-03' },
    { id: 'STAFF-12', code: 'EMP-025', name: 'Harish Rao', dept: 'Facilities & Maintenance', zone: 'Zone A - Executive Maintenance', role: 'Facilities Tech', punchIn: '08:40 AM', status: 'PRESENT', terminal: 'BEL-01' },
  ];

  // 23 missing staff breakdown
  const missingStaff = [
    { id: 'MISS-01', code: 'EMP-002', name: 'Suresh Gowda', dept: 'Manufacturing', reason: 'APPROVED_LEAVE', detail: 'Casual Leave (Approved by HR)', expectedShift: 'Shift A' },
    { id: 'MISS-02', code: 'EMP-005', name: 'Anand Nayak', dept: 'Manufacturing', reason: 'WEEKLY_OFF', detail: 'Scheduled Tuesday Off', expectedShift: 'Shift A' },
    { id: 'MISS-03', code: 'EMP-006', name: 'Deepa Shettigar', dept: 'Retail & Showroom', reason: 'REMOTE_FIELD', detail: 'Client Sourcing in Bengaluru', expectedShift: 'Field Duty' },
    { id: 'MISS-04', code: 'EMP-008', name: 'Priya Joshi', dept: 'Retail & Showroom', reason: 'APPROVED_LEAVE', detail: 'Sick Leave (Day 2 of 2)', expectedShift: 'Shift A' },
    { id: 'MISS-05', code: 'EMP-010', name: 'Vikram Singh', dept: 'Admin & HR', reason: 'REMOTE_FIELD', detail: 'Regional Compliance Audit (SHI Hub)', expectedShift: 'Field Duty' },
    { id: 'MISS-06', code: 'EMP-012', name: 'Manjunath Bhat', dept: 'Manufacturing', reason: 'APPROVED_LEAVE', detail: 'Earned Leave (Family function)', expectedShift: 'Shift A' },
    { id: 'MISS-07', code: 'EMP-013', name: 'Meenakshi Rao', dept: 'Manufacturing', reason: 'WEEKLY_OFF', detail: 'Roster Weekly Off', expectedShift: 'Shift A' },
    { id: 'MISS-08', code: 'EMP-015', name: 'Ganesh Kulkarni', dept: 'Security & Facilities', reason: 'SHIFT_PENDING', detail: 'Evening Shift starts at 14:00', expectedShift: 'Shift B' },
    { id: 'MISS-09', code: 'EMP-017', name: 'Arun Deshmukh', dept: 'Manufacturing', reason: 'APPROVED_LEAVE', detail: 'Casual Leave', expectedShift: 'Shift A' },
    { id: 'MISS-10', code: 'EMP-019', name: 'Sneha Kamath', dept: 'Retail & Showroom', reason: 'REMOTE_FIELD', detail: 'Wedding Collection Trunk Show', expectedShift: 'Field Duty' },
    { id: 'MISS-11', code: 'EMP-021', name: 'Mahesh Patil', dept: 'Manufacturing', reason: 'APPROVED_LEAVE', detail: 'Medical Leave', expectedShift: 'Shift A' },
    { id: 'MISS-12', code: 'EMP-022', name: 'Bhavya Hegde', dept: 'Admin & HR', reason: 'REMOTE_FIELD', detail: 'Work From Home (Approved)', expectedShift: 'Remote' },
    { id: 'MISS-13', code: 'EMP-024', name: 'Geetha Reddy', dept: 'Manufacturing', reason: 'WEEKLY_OFF', detail: 'Roster Off', expectedShift: 'Shift A' },
    { id: 'MISS-14', code: 'EMP-026', name: 'Prashant Nayak', dept: 'Manufacturing', reason: 'APPROVED_LEAVE', detail: 'Privilege Leave', expectedShift: 'Shift A' },
    { id: 'MISS-15', code: 'EMP-027', name: 'Shruti Kulkarni', dept: 'Retail & Showroom', reason: 'REMOTE_FIELD', detail: 'Showroom Client Visit', expectedShift: 'Field Duty' },
    { id: 'MISS-16', code: 'EMP-028', name: 'Karthik Rao', dept: 'Manufacturing', reason: 'APPROVED_LEAVE', detail: 'Casual Leave', expectedShift: 'Shift A' },
    { id: 'MISS-17', code: 'EMP-029', name: 'Savita Joshi', dept: 'Admin & HR', reason: 'REMOTE_FIELD', detail: 'GST Filing Remote Session', expectedShift: 'Remote' },
    { id: 'MISS-18', code: 'EMP-030', name: 'Naveen Kumar', dept: 'Manufacturing', reason: 'WEEKLY_OFF', detail: 'Weekly Off', expectedShift: 'Shift A' },
    { id: 'MISS-19', code: 'EMP-031', name: 'Rekha Deshmukh', dept: 'Manufacturing', reason: 'APPROVED_LEAVE', detail: 'Maternity Allowance Phase', expectedShift: 'Special Leave' },
    { id: 'MISS-20', code: 'EMP-032', name: 'Santosh Gowda', dept: 'Security & Facilities', reason: 'SHIFT_PENDING', detail: 'Night Guard Duty (Starts 22:00)', expectedShift: 'Shift C' },
    { id: 'MISS-21', code: 'EMP-033', name: 'Anitha Bhat', dept: 'Retail & Showroom', reason: 'REMOTE_FIELD', detail: 'Regional Exhibition Stall', expectedShift: 'Field Duty' },
    { id: 'MISS-22', code: 'EMP-034', name: 'Deepak Reddy', dept: 'Manufacturing', reason: 'APPROVED_LEAVE', detail: 'Festival Compensatory Off', expectedShift: 'Shift A' },
    { id: 'MISS-23', code: 'EMP-035', name: 'Usha Kamath', dept: 'Admin & HR', reason: 'APPROVED_LEAVE', detail: 'Half Day (Afternoon session)', expectedShift: 'Shift A' },
  ];

  // Department headcount splits
  const departmentSplit = [
    { name: 'Manufacturing (Looms & Mill)', present: 6, expected: 18, pct: 33.3, status: 'Optimal Production Line', color: '#0058be' },
    { name: 'Administration & HR', present: 3, expected: 8, pct: 37.5, status: 'Core Leadership Active', color: '#10b981' },
    { name: 'Retail, Security & Facilities', present: 3, expected: 9, pct: 33.3, status: 'Front Doors Fully Manned', color: '#f59e0b' },
  ];

  // Zone concentration heatmap with rich telemetry per zone
  const floorZones = [
    {
      id: 'zone-a',
      name: 'Zone A - Retail Showroom & Executive',
      badge: 'Active Peak',
      count: 5,
      capacity: 6,
      occupancyPct: 94.2,
      status: 'Active Peak',
      staff: presentStaff.filter(s => s.zone.includes('Zone A')),
      capacityUtilization: {
        occupied: 5,
        capacity: 6,
        pct: 94.2,
        unoccupiedSlot: {
          slotNumber: 6,
          slotName: 'Visual Merchandiser / Shift B Lead',
          reason: 'Scheduled Shift B check-in pending at 14:00',
        },
        slots: [
          { slotNumber: 1, slotName: 'Showroom Lead', isOccupied: true, occupant: { name: 'Pooja Deshmukh', code: 'EMP-004', role: 'Showroom Lead', punchIn: '09:05 AM' } },
          { slotNumber: 2, slotName: 'Senior Sales Exec', isOccupied: true, occupant: { name: 'Rajesh Kumar', code: 'EMP-009', role: 'Senior Sales Exec', punchIn: '09:15 AM' } },
          { slotNumber: 3, slotName: 'HR Executive', isOccupied: true, occupant: { name: 'Kavita Bhat', code: 'EMP-003', role: 'HR Executive', punchIn: '08:52 AM' } },
          { slotNumber: 4, slotName: 'Accounts Officer', isOccupied: true, occupant: { name: 'Vijay Kamath', code: 'EMP-018', role: 'Accounts Officer', punchIn: '09:10 AM' } },
          { slotNumber: 5, slotName: 'Executive Maintenance', isOccupied: true, occupant: { name: 'Harish Rao', code: 'EMP-025', role: 'Facilities Tech', punchIn: '08:40 AM' } },
          { slotNumber: 6, slotName: 'Visual Merchandiser', isOccupied: false, unoccupiedReason: 'Shift B Lead - Scheduled check-in at 14:00' },
        ],
      },
      sensorFeed: [
        { terminalId: 'BEL-01', terminalName: 'Entrance Tablet A', timestamp: '09:15:22 AM', employeeCode: 'EMP-009', employeeName: 'Rajesh Kumar', authMethod: 'AI Face Verification (99.6%)', signalHealth: '14ms • Optical Optimal', status: 'VERIFIED' },
        { terminalId: 'BEL-01', terminalName: 'Executive Turnstile', timestamp: '09:10:04 AM', employeeCode: 'EMP-018', employeeName: 'Vijay Kamath', authMethod: 'Encrypted RFID Badge', signalHealth: '18ms • Optical Strong', status: 'VERIFIED' },
        { terminalId: 'BEL-01', terminalName: 'Entrance Tablet A', timestamp: '09:05:41 AM', employeeCode: 'EMP-004', employeeName: 'Pooja Deshmukh', authMethod: 'AI Face Verification (99.8%)', signalHealth: '16ms • Optical Optimal', status: 'VERIFIED' },
        { terminalId: 'BEL-01', terminalName: 'Executive Turnstile', timestamp: '08:52:19 AM', employeeCode: 'EMP-003', employeeName: 'Kavita Bhat', authMethod: 'AI Face Verification (99.4%)', signalHealth: '15ms • Optical Strong', status: 'VERIFIED' },
        { terminalId: 'BEL-01', terminalName: 'Executive Turnstile', timestamp: '08:40:02 AM', employeeCode: 'EMP-025', employeeName: 'Harish Rao', authMethod: 'Dynamic QR Pass', signalHealth: '19ms • Optical Normal', status: 'VERIFIED' },
      ],
      hourlyTrend: [
        { hour: '06:00', occupancy: 40.0 },
        { hour: '07:00', occupancy: 60.5 },
        { hour: '08:00', occupancy: 83.3 },
        { hour: '09:00', occupancy: 94.2 },
        { hour: '10:00', occupancy: 94.2 },
        { hour: '11:00', occupancy: 94.2 },
        { hour: '12:00', occupancy: 94.2 },
      ],
    },
    {
      id: 'zone-b',
      name: 'Zone B - Loom Hall & Spinning Mills',
      badge: 'Optimal Cadence',
      count: 4,
      capacity: 5,
      occupancyPct: 91.0,
      status: 'Optimal Cadence',
      staff: presentStaff.filter(s => s.zone.includes('Zone B')),
      capacityUtilization: {
        occupied: 4,
        capacity: 5,
        pct: 91.0,
        unoccupiedSlot: {
          slotNumber: 5,
          slotName: 'Junior Weaver / Apprentice Line 3',
          reason: 'On Approved Casual Leave (Anand Nayak - EMP-005)',
        },
        slots: [
          { slotNumber: 1, slotName: 'Master Weaver', isOccupied: true, occupant: { name: 'Ramesh Kulkarni', code: 'EMP-001', role: 'Master Weaver', punchIn: '08:45 AM' } },
          { slotNumber: 2, slotName: 'QC Floor Manager', isOccupied: true, occupant: { name: 'Amit Patel', code: 'EMP-011', role: 'QC Floor Manager', punchIn: '08:30 AM' } },
          { slotNumber: 3, slotName: 'Spinning Operator', isOccupied: true, occupant: { name: 'Mohammed Irfan', code: 'EMP-007', role: 'Spinning Operator', punchIn: '09:12 AM' } },
          { slotNumber: 4, slotName: 'Finishing Tech', isOccupied: true, occupant: { name: 'Lakshmi Hegde', code: 'EMP-016', role: 'Finishing Tech', punchIn: '09:00 AM' } },
          { slotNumber: 5, slotName: 'Junior Weaver / Apprentice Line 3', isOccupied: false, unoccupiedReason: 'On Approved Leave (Anand Nayak - EMP-005)' },
        ],
      },
      sensorFeed: [
        { terminalId: 'BEL-02', terminalName: 'Floor 1 Gate Scanner B', timestamp: '09:12:11 AM', employeeCode: 'EMP-007', employeeName: 'Mohammed Irfan', authMethod: 'AI Face Verification (99.7%)', signalHealth: '18ms • Looms Optimal', status: 'VERIFIED' },
        { terminalId: 'BEL-02', terminalName: 'Floor 1 Gate Scanner B', timestamp: '09:00:30 AM', employeeCode: 'EMP-016', employeeName: 'Lakshmi Hegde', authMethod: 'Encrypted RFID Badge', signalHealth: '19ms • Looms Optimal', status: 'VERIFIED' },
        { terminalId: 'BEL-02', terminalName: 'Weaving Hall Sensor B', timestamp: '08:45:12 AM', employeeCode: 'EMP-001', employeeName: 'Ramesh Kulkarni', authMethod: 'AI Face Verification (99.9%)', signalHealth: '17ms • Looms Optimal', status: 'VERIFIED' },
        { terminalId: 'BEL-02', terminalName: 'Weaving Hall Sensor B', timestamp: '08:30:55 AM', employeeCode: 'EMP-011', employeeName: 'Amit Patel', authMethod: 'Dynamic QR Pass', signalHealth: '21ms • Looms Optimal', status: 'VERIFIED' },
      ],
      hourlyTrend: [
        { hour: '06:00', occupancy: 35.0 },
        { hour: '07:00', occupancy: 60.0 },
        { hour: '08:00', occupancy: 80.0 },
        { hour: '09:00', occupancy: 91.0 },
        { hour: '10:00', occupancy: 91.0 },
        { hour: '11:00', occupancy: 91.0 },
        { hour: '12:00', occupancy: 91.0 },
      ],
    },
    {
      id: 'zone-c',
      name: 'Zone C - Gate, Fitting & Dispatch',
      badge: 'Balanced Guard',
      count: 3,
      capacity: 4,
      occupancyPct: 92.5,
      status: 'Balanced Guard',
      staff: presentStaff.filter(s => s.zone.includes('Zone C')),
      capacityUtilization: {
        occupied: 3,
        capacity: 4,
        pct: 92.5,
        unoccupiedSlot: {
          slotNumber: 4,
          slotName: 'Dispatch Handler / Loading Lead',
          reason: 'Field Transit / Scheduled Shift B at 13:30',
        },
        slots: [
          { slotNumber: 1, slotName: 'Security Supervisor', isOccupied: true, occupant: { name: 'Divya Reddy', code: 'EMP-020', role: 'Security Supervisor', punchIn: '07:55 AM' } },
          { slotNumber: 2, slotName: 'CCTV Operator', isOccupied: true, occupant: { name: 'Chetan Joshi', code: 'EMP-023', role: 'CCTV Operator', punchIn: '08:00 AM' } },
          { slotNumber: 3, slotName: 'Cashier / POS Lead', isOccupied: true, occupant: { name: 'Sunita Rao', code: 'EMP-014', role: 'Cashier / POS', punchIn: '09:33 AM' } },
          { slotNumber: 4, slotName: 'Dispatch Handler / Loading Lead', isOccupied: false, unoccupiedReason: 'Field Transit / Shift B (13:30)' },
        ],
      },
      sensorFeed: [
        { terminalId: 'BEL-03', terminalName: 'Canteen & Dispatch Scanner C', timestamp: '09:33:45 AM', employeeCode: 'EMP-014', employeeName: 'Sunita Rao', authMethod: 'Encrypted RFID Badge', signalHealth: '22ms • Dispatch Normal', status: 'VERIFIED' },
        { terminalId: 'BEL-03', terminalName: 'Main Gate Scanner C', timestamp: '08:00:15 AM', employeeCode: 'EMP-023', employeeName: 'Chetan Joshi', authMethod: 'AI Face Verification (99.8%)', signalHealth: '16ms • Gate Optimal', status: 'VERIFIED' },
        { terminalId: 'BEL-03', terminalName: 'Main Gate Scanner C', timestamp: '07:55:09 AM', employeeCode: 'EMP-020', employeeName: 'Divya Reddy', authMethod: 'AI Face Verification (99.5%)', signalHealth: '15ms • Gate Optimal', status: 'VERIFIED' },
      ],
      hourlyTrend: [
        { hour: '06:00', occupancy: 50.0 },
        { hour: '07:00', occupancy: 75.0 },
        { hour: '08:00', occupancy: 92.5 },
        { hour: '09:00', occupancy: 92.5 },
        { hour: '10:00', occupancy: 92.5 },
        { hour: '11:00', occupancy: 92.5 },
        { hour: '12:00', occupancy: 92.5 },
      ],
    },
  ];

  // Historical trend comparison (Today vs Last Week)
  const historicalTrend = [
    { day: 'Mon', today: 89.2, lastWeek: 88.0 },
    { day: 'Tue', today: 91.0, lastWeek: 89.5 },
    { day: 'Wed', today: 90.5, lastWeek: 90.0 },
    { day: 'Thu', today: 92.0, lastWeek: 91.2 },
    { day: 'Fri (Today)', today: 92.5, lastWeek: 90.7 },
  ];

  return NextResponse.json({
    success: true,
    data: {
      summary: {
        presentCount: 12,
        expectedTotal: 35,
        missingCount: 23,
        floorOccupancyRate: 92.5,
        occupancyDelta: '+1.8% vs Expected Shift A',
        lastWeekAverage: 90.7,
      },
      missingReasonsSummary: {
        onApprovedLeave: 14,
        remoteOrFieldDuty: 7,
        shiftPendingOrLater: 2,
        unauthorizedLate: 0,
      },
      presentStaff,
      missingStaff,
      departmentSplit,
      floorZones,
      historicalTrend,
    },
    timestamp: new Date().toISOString(),
  });
}
