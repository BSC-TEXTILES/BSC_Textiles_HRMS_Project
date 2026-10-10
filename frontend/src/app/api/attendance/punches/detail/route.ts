import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const terminalFilter = searchParams.get('terminal') || 'all';
  const deptFilter = searchParams.get('department') || 'all';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const search = (searchParams.get('search') || '').toLowerCase();

  const DEPARTMENTS = ['Spinning Unit', 'Weaving Section', 'Garmenting', 'Quality Control', 'Retail & Sales', 'Administration'];
  const TERMINALS = [
    { code: 'BEL-01', name: 'BEL-01 Entrance Tablet A' },
    { code: 'BEL-02', name: 'BEL-02 Floor 1 Gate Scanner B' },
    { code: 'BEL-03', name: 'BEL-03 Canteen Scanner C' },
    { code: 'DAV-02', name: 'DAV-02 Showroom Biometric' },
    { code: 'SHI-03', name: 'SHI-03 Concierge Face Cam' }
  ];

  const FIRST_NAMES = ['Ramesh', 'Suresh', 'Kavita', 'Pooja', 'Anand', 'Deepa', 'Mohammed', 'Priya', 'Rajesh', 'Sunita', 'Amit', 'Vikram', 'Lakshmi', 'Ganesh', 'Manjunath', 'Meenakshi', 'Arun', 'Vijay', 'Divya', 'Sneha', 'Mahesh', 'Bhavya', 'Chetan', 'Geetha', 'Harish'];
  const LAST_NAMES = ['Kulkarni', 'Bhat', 'Patel', 'Deshmukh', 'Gowda', 'Kumar', 'Singh', 'Nayak', 'Irfan', 'Shetty', 'Joshi', 'Hegde', 'Rao', 'Reddy', 'Kamath'];

  // Sets to guarantee exact counts: 12 OUT punches, 38 IN punches, 2 Missing punches
  const OUT_INDICES = new Set([3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47]); // 12
  const MISSING_INDICES = new Set([5, 17]); // 2 (subset of IN punches)

  // Generate 50 realistic punched-in employees
  const allPunches = Array.from({ length: 50 }, (_, i) => {
    const id = i + 1;
    const empCode = `EMP-${String(id).padStart(3, '0')}`;
    const firstName = FIRST_NAMES[i % FIRST_NAMES.length];
    const lastName = LAST_NAMES[(i * 3) % LAST_NAMES.length];
    const dept = DEPARTMENTS[i % DEPARTMENTS.length];
    const termObj = TERMINALS[i % TERMINALS.length];

    const isOut = OUT_INDICES.has(i);
    const isMissing = MISSING_INDICES.has(i);

    // Stagger punch times around 08:30 to 09:40
    const inHour = i < 35 ? 9 : (i < 45 ? 8 : 10);
    const inMinute = (i * 7) % 60;
    const inTimeStr = `${String(inHour).padStart(2, '0')}:${String(inMinute).padStart(2, '0')} AM`;
    const outTimeStr = `${String((inHour + 9) % 12 || 12).padStart(2, '0')}:${String((inMinute + 15) % 60).padStart(2, '0')} PM`;
    const isGrace = i >= 10 && i < 15; // 5 in grace period

    return {
      id: `punch-${id}`,
      employeeId: empCode,
      employeeName: `${firstName} ${lastName}`,
      department: dept,
      terminalCode: termObj.code,
      terminalName: termObj.name,
      locationName: termObj.code.startsWith('BEL') ? 'Belagavi Flagship (BEL-01)' : termObj.code.startsWith('DAV') ? 'Davanagere Showroom (DAV-02)' : 'Shivamogga Apex (SHI-03)',
      punchTime: isOut ? outTimeStr : inTimeStr,
      punchType: isOut ? ('OUT' as const) : ('IN' as const),
      method: (i % 3 === 0 ? 'FACE' : i % 3 === 1 ? 'QR' : 'RFID') as 'FACE' | 'QR' | 'RFID',
      matchScore: 96 + (i % 4),
      shiftName: i < 35 ? 'Shift A (Morning 09:30-18:30)' : (i < 47 ? 'Shift B (General 10:00-19:00)' : 'Shift C (Night)'),
      status: isGrace ? ('GRACE' as const) : (isOut ? ('COMPLETED' as const) : ('ON_TIME' as const)),
      avatarColor: ['#0058be', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'][i % 5],
      isMissingPunch: isMissing,
      expectedShiftEnd: isMissing ? '06:30 PM' : undefined,
      missingReason: isMissing ? 'Unclosed checkout from shift (Shift ended 18:30)' : undefined,
    };
  });

  // Apply filters
  let filtered = allPunches;
  if (terminalFilter !== 'all') {
    filtered = filtered.filter(p => p.terminalCode === terminalFilter || p.terminalName.includes(terminalFilter));
  }
  if (deptFilter !== 'all') {
    filtered = filtered.filter(p => p.department === deptFilter);
  }
  if (search) {
    filtered = filtered.filter(p =>
      p.employeeName.toLowerCase().includes(search) ||
      p.employeeId.toLowerCase().includes(search) ||
      p.department.toLowerCase().includes(search)
    );
  }

  const total = filtered.length;
  const paginated = filtered.slice((page - 1) * limit, page * limit);

  // Hourly velocity sparkline data (9AM peak)
  const hourlyVelocity = [
    { hour: '07:00 AM', punches: 2, velocity: 'Low' },
    { hour: '08:00 AM', punches: 8, velocity: 'Normal' },
    { hour: '08:30 AM', punches: 16, velocity: 'Surge' },
    { hour: '09:00 AM', punches: 18, velocity: 'Peak (9AM)' },
    { hour: '09:30 AM', punches: 4, velocity: 'Grace Window' },
    { hour: '10:00 AM', punches: 2, velocity: 'Standard' },
  ];

  return NextResponse.json({
    success: true,
    data: {
      records: paginated,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        totalPunchesToday: 50,
        inPunchOnly: 38,
        outPunchCompleted: 12,
        syncRate: 99.8,
        missingPunchesCount: 2,
        missingPunchesAlert: '2 previous-shift workers without confirmed checkout punch',
        shiftDistribution: {
          'Shift A (Morning)': 35,
          'Shift B (General)': 12,
          'Shift C (Evening)': 3,
        },
      },
      hourlyVelocity,
      terminalsList: TERMINALS,
      departmentsList: DEPARTMENTS,
    },
    timestamp: new Date().toISOString(),
  });
}
