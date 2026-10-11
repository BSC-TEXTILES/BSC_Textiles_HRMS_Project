export type MetricDetailType = 'punches' | 'presence' | 'terminals' | 'punctuality' | 'liveness' | null;

// ==========================================
// 1. Total Today Punches Types
// ==========================================
export interface PunchItem {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  terminalCode: string;
  terminalName: string;
  locationName: string;
  punchTime: string;
  punchType: 'IN' | 'OUT';
  method: 'FACE' | 'QR' | 'RFID';
  matchScore: number;
  shiftName: string;
  status: 'ON_TIME' | 'GRACE' | 'COMPLETED';
  avatarColor: string;
}

export interface PunchesDetailResponse {
  records: PunchItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  stats: {
    totalPunchesToday: number;
    inPunchOnly: number;
    outPunchCompleted: number;
    syncRate: number;
    missingPunchesCount: number;
    missingPunchesAlert: string;
    shiftDistribution: Record<string, number>;
  };
  hourlyVelocity: Array<{ hour: string; punches: number; velocity: string }>;
  terminalsList: Array<{ code: string; name: string }>;
  departmentsList: string[];
}

// ==========================================
// 2. On-Floor Live Presence Types
// ==========================================
export interface PresenceStaffItem {
  id: string;
  code: string;
  name: string;
  dept: string;
  zone: string;
  role: string;
  punchIn?: string;
  status?: string;
  terminal?: string;
  reason?: string;
  detail?: string;
  expectedShift?: string;
}

export interface PresenceDetailResponse {
  summary: {
    presentCount: number;
    expectedTotal: number;
    missingCount: number;
    floorOccupancyRate: number;
    occupancyDelta: string;
    lastWeekAverage: number;
  };
  missingReasonsSummary: {
    onApprovedLeave: number;
    remoteOrFieldDuty: number;
    shiftPendingOrLater: number;
    unauthorizedLate: number;
  };
  presentStaff: PresenceStaffItem[];
  missingStaff: PresenceStaffItem[];
  departmentSplit: Array<{
    name: string;
    present: number;
    expected: number;
    pct: number;
    status: string;
    color: string;
  }>;
  floorZones: Array<{
    id: string;
    name: string;
    count: number;
    capacity: number;
    utilization: string;
    status: string;
    staffSample: string[];
  }>;
  historicalTrend: Array<{
    day: string;
    todayRate: number;
    lastWeekRate: number;
  }>;
}

// ==========================================
// 3. Active Terminals Types
// ==========================================
export interface TerminalDeviceItem {
  id: string;
  code: string;
  name: string;
  location: string;
  ipAddress: string;
  status: 'ONLINE' | 'OFFLINE' | 'MAINTENANCE';
  latency: number;
  packetLoss: number;
  heartbeat: string;
  uptime: number;
  firmwareVersion: string;
  updateAvailable: boolean;
  punchesRecordedToday: number;
  cameraActive: boolean;
  mode: string;
}

export interface TerminalsDetailResponse {
  summary: {
    totalTerminals: number;
    onlineCount: number;
    maintenanceCount: number;
    offlineCount: number;
    avgLatencyMs: number;
    avgPacketLossPct: number;
    systemHealth: string;
  };
  terminals: TerminalDeviceItem[];
  latencyTrend: Array<{
    time: string;
    avgLatency: number;
    packetLoss: number;
  }>;
  firmwareUpdatesPending: number;
}

// ==========================================
// 4. Punctuality Rate Types
// ==========================================
export interface PunctualityLateItem {
  id: string;
  code: string;
  name: string;
  department: string;
  scheduledIn: string;
  actualIn: string;
  minutesLate: number;
  reason: string;
  penaltyApplied: string;
}

export interface PunctualityGraceItem {
  id: string;
  code: string;
  name: string;
  department: string;
  scheduledIn: string;
  actualIn: string;
  minutesIntoGrace: number;
  secondsRemaining: number;
  status: string;
}

export interface PunctualityDetailResponse {
  metrics: {
    currentPunctualityRate: number;
    onTimeEmployees: number;
    gracePeriodEmployees: number;
    lateArrivalsCount: number;
    targetRate: number;
    warningThreshold: number;
    isWarningTriggered: boolean;
  };
  lateArrivals: PunctualityLateItem[];
  gracePeriodStaff: PunctualityGraceItem[];
  departmentBreakdown: Array<{
    dept: string;
    onTimeRate: number;
    onTimeCount: number;
    totalStaff: number;
    targetMet: boolean;
  }>;
  sevenDayTrend: Array<{
    date: string;
    dayLabel: string;
    rate: number;
    target: number;
  }>;
}

// ==========================================
// 5. AI Liveness Rate Types
// ==========================================
export interface LivenessVerificationItem {
  id: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  terminal: string;
  livenessScore: number;
  method: string;
  timestamp: string;
  result: string;
  spoofDetected: boolean;
  antiSpoofMetrics: {
    skinTextureScore: number;
    depthParallaxScore: number;
    infraredIrisScore: number;
  };
}

export interface LivenessDetailResponse {
  summary: {
    livenessRate: number;
    verifiedCount: number;
    spoofingAttemptsToday: number;
    sensitivityThreshold: number;
    passiveConfidenceAvg: number;
  };
  recentLogs: LivenessVerificationItem[];
  deviceHealth: Array<{
    terminalCode: string;
    name: string;
    cameraQualityScore: number;
    ambientLightCondition: string;
    luxValue: number;
    fps: number;
    status: string;
  }>;
  spoofAlerts: Array<{
    id: string;
    timestamp: string;
    terminal: string;
    type: string;
    severity: string;
    details: string;
  }>;
}
