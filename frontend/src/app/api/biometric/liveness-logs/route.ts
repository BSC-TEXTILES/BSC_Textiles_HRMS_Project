import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * AI liveness / anti-spoofing drill-down.
 *
 * Backed only by endpoints that already exist:
 *   GET /api/face-verification/history — stored verification attempts
 *   GET /api/face-verification/stats   — stored pass/fail and score aggregates
 *
 * The terminals in this deployment record a match percentage only when the
 * device itself reports one, so `livenessScore` is null whenever no score was
 * captured. Nothing here synthesises a score, an anti-spoof sub-metric, a lux
 * reading or a camera health number.
 */

const API_BASE = (
  process.env.BACKEND_URL
    ? `${process.env.BACKEND_URL.replace(/\/+$/, '')}/api`
    : 'http://localhost:4000/api'
).replace(/\/+$/, '');

async function backendGet(request: Request, path: string): Promise<any | null> {
  return backendFetch(request, path, 'GET');
}

async function backendFetch(
  request: Request,
  path: string,
  method: 'GET' | 'PUT',
  body?: unknown
): Promise<any | null> {
  try {
    const cookie = request.headers.get('cookie');
    const authorization = request.headers.get('authorization');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (cookie) headers.cookie = cookie;
    if (authorization) headers.authorization = authorization;

    if (method === 'PUT') {
      headers['Content-Type'] = 'application/json';
      // Double-submit CSRF: the readable csrf_token cookie mirrors the header the
      // browser client normally sends.
      const csrf = /(?:^|;\s*)csrf_token=([^;]+)/.exec(cookie || '')?.[1];
      if (csrf) headers['x-csrf-token'] = decodeURIComponent(csrf);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: method === 'PUT' ? JSON.stringify(body ?? {}) : undefined,
      cache: 'no-store',
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function numOr(value: any): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function textOr(value: any): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(request: Request) {
  const [history, stats, settings] = await Promise.all([
    backendGet(request, '/face-verification/history?limit=20'),
    backendGet(request, '/face-verification/stats'),
    backendGet(request, '/settings'),
  ]);

  const rows: any[] = Array.isArray(history?.rows)
    ? history.rows
    : Array.isArray(history?.verifications)
      ? history.verifications
      : [];

  const recentLogs = rows.map((row) => {
    const score = numOr(row.score ?? row.matchPercentage);
    return {
      id: String(row.id ?? `fv-${row.employeeId ?? 'unknown'}`),
      employeeCode: textOr(row.employeeCode) ?? 'Unmatched device ID',
      employeeName: textOr(row.employeeName) ?? 'Unmatched device ID',
      department: textOr(row.departmentName) ?? 'Not reported',
      terminal: textOr(row.deviceName) ?? textOr(row.locationName) ?? 'Terminal not identified',
      // Only ever the value the terminal stored for this attempt.
      livenessScore: score,
      method: textOr(row.purpose) ? `Recorded for ${textOr(row.purpose)}` : 'Method not reported by device',
      timestamp: row.attemptedAt
        ? new Date(row.attemptedAt).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
          })
        : null,
      result: textOr(row.status) ?? textOr(row.result) ?? 'RECORDED',
      // The device does not report an anti-spoof verdict, so none is asserted.
      spoofDetected: null,
      // No SDK in this deployment exposes per-channel anti-spoof sub-scores.
      antiSpoofMetrics: null,
    };
  });

  const verifiedToday = numOr(stats?.summary?.verifiedToday) ?? 0;
  const failedToday = numOr(stats?.summary?.failedToday) ?? 0;
  const recordedToday = verifiedToday + failedToday;
  const avgMatchConfidence = numOr(stats?.summary?.averageMatchPercent);
  const highestMatch = numOr(stats?.summary?.highestMatchPercent);
  // The threshold the backend actually stores for the location
  // (attendanceRules.faceVerificationThreshold), not a UI default.
  const configuredThreshold = numOr(settings?.settings?.faceVerificationThreshold);
  const currentThreshold = configuredThreshold ?? numOr(rows[0]?.threshold);

  return NextResponse.json({
    success: true,
    data: {
      summary: {
        livenessRatePct:
          recordedToday > 0 ? Number(((verifiedToday / recordedToday) * 100).toFixed(1)) : null,
        spoofingAttemptsToday: null,
        totalVerificationsToday: recordedToday,
        avgMatchConfidence: avgMatchConfidence !== null ? avgMatchConfidence : highestMatch,
        currentThreshold,
        hardwareIntegrityStatus: 'Not reported by device',
      },
      recentLogs,
      // Camera optical scores, lux readings and lens conditions are not emitted
      // by the terminals, so there is nothing to show.
      deviceCameraHealth: [],
      securityAlerts: [],
    },
    timestamp: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (typeof body.threshold !== 'number' || body.threshold < 75 || body.threshold > 99) {
      return NextResponse.json(
        { success: false, message: 'Invalid threshold (must be 75-99)' },
        { status: 400 }
      );
    }

    // Persist through the settings route that already owns this value instead of
    // keeping an in-memory number the terminals never receive.
    const saved = await backendFetch(request, '/settings', 'PUT', {
      faceVerificationThreshold: body.threshold,
    });
    if (!saved) {
      return NextResponse.json({
        success: false,
        message: 'Threshold was not saved — the settings service rejected the request.',
        threshold: body.threshold,
      }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      message: `Face verification threshold stored for this location (${body.threshold}%).`,
      threshold: body.threshold,
    });
  } catch {
    return NextResponse.json({ success: false, message: 'Bad request' }, { status: 400 });
  }
}
