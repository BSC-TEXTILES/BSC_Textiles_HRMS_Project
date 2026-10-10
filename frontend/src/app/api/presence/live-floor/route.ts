import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // 12 staff physically present on floor
  const presentStaff = [
    { id: 'STAFF-01', code: 'EMP-001', name: 'Ramesh Kulkarni', dept: 'Manufacturing (Looms)', zone: 'Zone B - Loom Hall', role: 'Master Weaver', punchIn: '08:45 AM', status: 'PRESENT', terminal: 'BEL-01' },
    { id: 'STAFF-02', code: 'EMP-003', name: 'Kavita Bhat', dept: 'Admin & HR', zone: 'Zone A - Executive Floor', role: 'HR Executive', punchIn: '08:52 AM', status: 'PRESENT', terminal: 'BEL-01' },
    { id: 'STAFF-03', code: 'EMP-004', name: 'Pooja Deshmukh', dept: 'Retail & Showroom', zone: 'Zone A - Retail Front', role: 'Showroom Lead', punchIn: '09:05 AM', status: 'PRESENT', terminal: 'BEL-01' },
    { id: 'STAFF-04', code: 'EMP-007', name: 'Mohammed Irfan', dept: 'Manufacturing (Spinning)', zone: 'Zone B - Loom Hall', role: 'Spinning Operator', punchIn: '09:12 AM', status: 'PRESENT', terminal: 'BEL-02' },
    { id: 'STAFF-05', code: 'EMP-009', name: 'Rajesh Kumar', dept: 'Retail & Showroom', zone: 'Zone A - Retail Front', role: 'Senior Sales Exec', punchIn: '09:15 AM', status: 'PRESENT', terminal: 'BEL-01' },
    { id: 'STAFF-06', code: 'EMP-011', name: 'Amit Patel', dept: 'Manufacturing (QC)', zone: 'Zone B - Quality Testing', role: 'Floor Manager', punchIn: '08:30 AM', status: 'PRESENT', terminal: 'BEL-02' },
    { id: 'STAFF-07', code: 'EMP-014', name: 'Sunita Rao', dept: 'Retail & Showroom', zone: 'Zone C - Billing Desk', role: 'Cashier / POS', punchIn: '09:33 AM', status: 'PRESENT', terminal: 'BEL-01' },
    { id: 'STAFF-08', code: 'EMP-016', name: 'Lakshmi Hegde', dept: 'Manufacturing (Finishing)', zone: 'Zone B - Loom Hall', role: 'Finishing Tech', punchIn: '09:00 AM', status: 'PRESENT', terminal: 'BEL-02' },
    { id: 'STAFF-09', code: 'EMP-018', name: 'Vijay Kamath', dept: 'Admin & HR', zone: 'Zone A - Executive Floor', role: 'Accounts Officer', punchIn: '09:10 AM', status: 'PRESENT', terminal: 'BEL-01' },
    { id: 'STAFF-10', code: 'EMP-020', name: 'Divya Reddy', dept: 'Security & Facilities', zone: 'Zone C - Gate & Security', role: 'Security Supervisor', punchIn: '07:55 AM', status: 'PRESENT', terminal: 'BEL-01' },
    { id: 'STAFF-11', code: 'EMP-023', name: 'Chetan Joshi', dept: 'Security & Facilities', zone: 'Zone C - Gate & Security', role: 'CCTV Operator', punchIn: '08:00 AM', status: 'PRESENT', terminal: 'BEL-03' },
    { id: 'STAFF-12', code: 'EMP-025', name: 'Harish Rao', dept: 'Manufacturing (Maintenance)', zone: 'Zone B - Technical Bay', role: 'Electrical Tech', punchIn: '08:40 AM', status: 'PRESENT', terminal: 'BEL-02' },
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

  // Zone concentration heatmap
  const floorZones = [
    { id: 'zone-a', name: 'Zone A - Retail Showroom & Executive', count: 5, capacity: 6, occupancyPct: 94.2, status: 'Active Peak', staff: presentStaff.filter(s => s.zone.includes('Zone A')) },
    { id: 'zone-b', name: 'Zone B - Loom Hall & Spinning Mills', count: 4, capacity: 5, occupancyPct: 91.0, status: 'Optimal Cadence', staff: presentStaff.filter(s => s.zone.includes('Zone B')) },
    { id: 'zone-c', name: 'Zone C - Gate, Fitting & Dispatch', count: 3, capacity: 4, occupancyPct: 92.5, status: 'Balanced Guard', staff: presentStaff.filter(s => s.zone.includes('Zone C')) },
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
