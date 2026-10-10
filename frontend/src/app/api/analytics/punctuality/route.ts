import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Tab 1: Late arrivals today (0 late arrivals!)
  const lateArrivals: Array<{
    id: string;
    code: string;
    name: string;
    department: string;
    scheduledIn: string;
    actualIn: string;
    minutesLate: number;
    reason: string;
    penaltyApplied: number;
    status: string;
  }> = [];

  // Tab 2: 5 Employees currently in grace period (-5min window)
  const gracePeriodStaff = [
    {
      id: 'GRACE-01',
      code: 'EMP-014',
      name: 'Sunita Rao',
      department: 'Retail & Showroom',
      shiftName: 'Shift A (09:30 AM)',
      scheduledTime: '09:30 AM',
      actualPunchTime: '09:33:14 AM',
      graceUsedMinutes: 3.2,
      remainingGraceSeconds: 108, // countdown timer
      status: 'WITHIN_GRACE_WINDOW',
      verdict: 'Marked On-Time (Grace Consumed: 1 of 3 monthly allowances)',
      avatar: '#0058be',
    },
    {
      id: 'GRACE-02',
      code: 'EMP-022',
      name: 'Mohammed Irfan',
      department: 'Weaving Section',
      shiftName: 'Shift A (09:30 AM)',
      scheduledTime: '09:30 AM',
      actualPunchTime: '09:34:02 AM',
      graceUsedMinutes: 4.0,
      remainingGraceSeconds: 58,
      status: 'WITHIN_GRACE_WINDOW',
      verdict: 'Marked On-Time (Grace Consumed: 2 of 3 monthly allowances)',
      avatar: '#10b981',
    },
    {
      id: 'GRACE-03',
      code: 'EMP-031',
      name: 'Deepa Nayak',
      department: 'Garmenting Unit',
      shiftName: 'Shift A (09:30 AM)',
      scheduledTime: '09:30 AM',
      actualPunchTime: '09:32:45 AM',
      graceUsedMinutes: 2.8,
      remainingGraceSeconds: 135,
      status: 'WITHIN_GRACE_WINDOW',
      verdict: 'Marked On-Time (Grace Consumed: 1 of 3 monthly allowances)',
      avatar: '#f59e0b',
    },
    {
      id: 'GRACE-04',
      code: 'EMP-038',
      name: 'Anand Kulkarni',
      department: 'Administration',
      shiftName: 'Shift A (09:30 AM)',
      scheduledTime: '09:30 AM',
      actualPunchTime: '09:31:20 AM',
      graceUsedMinutes: 1.3,
      remainingGraceSeconds: 220,
      status: 'WITHIN_GRACE_WINDOW',
      verdict: 'Marked On-Time (Grace Consumed: 1 of 3 monthly allowances)',
      avatar: '#8b5cf6',
    },
    {
      id: 'GRACE-05',
      code: 'EMP-045',
      name: 'Priya Deshmukh',
      department: 'Quality Control',
      shiftName: 'Shift A (09:30 AM)',
      scheduledTime: '09:30 AM',
      actualPunchTime: '09:34:40 AM',
      graceUsedMinutes: 4.7,
      remainingGraceSeconds: 20,
      status: 'WITHIN_GRACE_WINDOW',
      verdict: 'Marked On-Time (Grace Consumed: 3 of 3 monthly allowances - Final Grace)',
      avatar: '#ec4899',
    },
  ];

  // Tab 3: Department punctuality comparison (Target: 95%+)
  const departmentBreakdown = [
    { department: 'Administration & HR', onTimePct: 98.5, target: 95.0, staffCount: 8, status: 'Exceeding Target' },
    { department: 'Spinning Mill', onTimePct: 97.2, target: 95.0, staffCount: 12, status: 'Exceeding Target' },
    { department: 'Retail Showrooms', onTimePct: 96.8, target: 95.0, staffCount: 15, status: 'Exceeding Target' },
    { department: 'Weaving Section', onTimePct: 95.9, target: 95.0, staffCount: 18, status: 'Optimal' },
    { department: 'Garmenting Unit', onTimePct: 95.1, target: 95.0, staffCount: 14, status: 'At Threshold' },
  ];

  // Tab 4: 7-day trend line
  const sevenDayTrends = [
    { day: '6 Days Ago', punctualityRate: 94.8, target: 95.0, lateCount: 2 },
    { day: '5 Days Ago', punctualityRate: 95.2, target: 95.0, lateCount: 2 },
    { day: '4 Days Ago', punctualityRate: 95.8, target: 95.0, lateCount: 1 },
    { day: '3 Days Ago', punctualityRate: 96.0, target: 95.0, lateCount: 1 },
    { day: '2 Days Ago', punctualityRate: 96.1, target: 95.0, lateCount: 1 },
    { day: 'Yesterday', punctualityRate: 96.3, target: 95.0, lateCount: 1 },
    { day: 'Today', punctualityRate: 96.4, target: 95.0, lateCount: 0, isCurrent: true },
  ];

  return NextResponse.json({
    success: true,
    data: {
      metrics: {
        currentPunctualityRate: 96.4,
        onTimeEmployees: 45,
        gracePeriodEmployees: 5,
        lateArrivalsCount: 0,
        targetRate: 95.0,
        warningThreshold: 90.0,
        isWarningTriggered: false, // true if < 90%
      },
      lateArrivals,
      gracePeriodStaff,
      departmentBreakdown,
      sevenDayTrends,
    },
    timestamp: new Date().toISOString(),
  });
}
