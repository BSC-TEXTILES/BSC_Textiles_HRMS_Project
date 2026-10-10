import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

let currentSensitivityThreshold = 95;

export async function GET(request: Request) {
  const TERMINALS = [
    'BEL-01 Entrance Face Gate A',
    'BEL-02 Floor 1 Loom Terminal B',
    'BEL-03 Tea & Canteen Scanner C',
    'DAV-02 Showroom Biometric 1',
    'SHI-03 Front Concierge Cam 1'
  ];

  const STAFF_POOL = [
    { code: 'EMP-001', name: 'Ramesh Kulkarni', dept: 'Weaving' },
    { code: 'EMP-003', name: 'Kavita Bhat', dept: 'HR & Admin' },
    { code: 'EMP-004', name: 'Pooja Deshmukh', dept: 'Retail' },
    { code: 'EMP-007', name: 'Mohammed Irfan', dept: 'Spinning' },
    { code: 'EMP-009', name: 'Rajesh Kumar', dept: 'Sales' },
    { code: 'EMP-011', name: 'Amit Patel', dept: 'Floor QC' },
    { code: 'EMP-014', name: 'Sunita Rao', dept: 'Billing' },
    { code: 'EMP-016', name: 'Lakshmi Hegde', dept: 'Finishing' },
    { code: 'EMP-018', name: 'Vijay Kamath', dept: 'Accounts' },
    { code: 'EMP-020', name: 'Divya Reddy', dept: 'Security' },
    { code: 'EMP-023', name: 'Chetan Joshi', dept: 'Security' },
    { code: 'EMP-025', name: 'Harish Rao', dept: 'Maintenance' },
    { code: 'EMP-028', name: 'Karthik Rao', dept: 'Spinning' },
    { code: 'EMP-031', name: 'Deepa Nayak', dept: 'Garmenting' },
    { code: 'EMP-038', name: 'Anand Kulkarni', dept: 'Admin' },
    { code: 'EMP-041', name: 'Suresh Gowda', dept: 'Weaving' },
    { code: 'EMP-045', name: 'Priya Deshmukh', dept: 'QC' },
    { code: 'EMP-047', name: 'Ganesh Joshi', dept: 'Logistics' },
    { code: 'EMP-049', name: 'Sneha Hegde', dept: 'Sales' },
    { code: 'EMP-050', name: 'Mahesh Reddy', dept: 'Inventory' },
  ];

  // Recent 20 facial recognition verification attempts
  const recentVerificationLogs = STAFF_POOL.map((staff, idx) => {
    const minutesAgo = (idx * 3) + 2;
    const now = new Date();
    const attemptTime = new Date(now.getTime() - minutesAgo * 60 * 1000);
    const score = 97 + (idx % 4); // 97-100% liveness score
    const isChallenge = idx % 3 === 0;

    return {
      id: `live-log-${idx + 1}`,
      employeeCode: staff.code,
      employeeName: staff.name,
      department: staff.dept,
      terminal: TERMINALS[idx % TERMINALS.length],
      livenessScore: score,
      method: isChallenge ? 'Active Challenge (Blink / Smile)' : 'Passive 3D Neural Depth Face',
      timestamp: attemptTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      result: 'VERIFIED_GENUINE',
      spoofDetected: false,
      antiSpoofMetrics: {
        skinTextureScore: 99.1,
        depthParallaxScore: 98.6,
        infraredIrisScore: 99.4,
      },
    };
  });

  // Device camera health & ambient lighting
  const deviceCameraHealth = [
    { terminal: 'BEL-01 Entrance Gate A', cameraScore: 99.4, lightingLux: 540, lightingStatus: 'Optimal (540 Lux)', lensCondition: 'Clean' },
    { terminal: 'BEL-02 Loom Hall Bay B', cameraScore: 98.8, lightingLux: 490, lightingStatus: 'Optimal (490 Lux)', lensCondition: 'Clean' },
    { terminal: 'BEL-03 Canteen Scanner C', cameraScore: 99.1, lightingLux: 610, lightingStatus: 'Optimal (610 Lux)', lensCondition: 'Clean' },
    { terminal: 'DAV-02 Showroom Cam 1', cameraScore: 99.6, lightingLux: 580, lightingStatus: 'Optimal (580 Lux)', lensCondition: 'Clean' },
    { terminal: 'SHI-03 Concierge Cam 1', cameraScore: 99.8, lightingLux: 560, lightingStatus: 'Optimal (560 Lux)', lensCondition: 'Clean' },
  ];

  return NextResponse.json({
    success: true,
    data: {
      summary: {
        livenessRatePct: 100.0,
        spoofingAttemptsToday: 0,
        totalVerificationsToday: 142,
        avgMatchConfidence: 98.7,
        currentThreshold: currentSensitivityThreshold,
        hardwareIntegrityStatus: '100% Genuine Device Fingerprints Verified',
      },
      recentLogs: recentVerificationLogs,
      deviceCameraHealth,
      securityAlerts: [
        {
          id: 'sec-01',
          type: 'SECURE',
          title: '0 Spoofing Attempts Detected Today',
          description: 'Zero silicone mask, printed photo, or video replay attacks identified across all 8 terminals in Karnataka hubs.',
          timestamp: 'Live Active Protection',
        },
        {
          id: 'sec-02',
          type: 'INFO',
          title: 'Neural Depth Anti-Spoofing Active',
          description: 'Biometric firmware v3.2.1 running multi-spectral IR texture analysis at 30fps.',
          timestamp: 'Synchronized',
        }
      ],
    },
    timestamp: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (typeof body.threshold === 'number' && body.threshold >= 75 && body.threshold <= 99) {
      currentSensitivityThreshold = body.threshold;
      return NextResponse.json({
        success: true,
        message: `Sensitivity threshold updated to ${currentSensitivityThreshold}%`,
        threshold: currentSensitivityThreshold,
      });
    }
    return NextResponse.json({ success: false, message: 'Invalid threshold (must be 75-99)' }, { status: 400 });
  } catch {
    return NextResponse.json({ success: false, message: 'Bad request' }, { status: 400 });
  }
}
