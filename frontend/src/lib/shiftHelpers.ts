/**
 * Shift parsing and formatting utilities for Executive Dashboard
 */


/**
 * Formats lunch break:
 * e.g. 100 min -> "100 min (1 hr 40 min)"
 * e.g. 60 min -> "60 min (1 hr)"
 * e.g. 45 min -> "45 min"
 */
export function formatLunchBreakDisplay(minutes?: number | null): string {
  if (minutes === undefined || minutes === null || isNaN(minutes)) {
    return 'Not available';
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hrs = Math.floor(minutes / 60);
  const remMins = minutes % 60;
  if (remMins > 0) {
    return `${minutes} min (${hrs} hr ${remMins} min)`;
  }
  return `${minutes} min (${hrs} hr)`;
}

/**
 * Formats 24-hr time string (e.g. "10:00", "21:30") or ISO Date to 12-hour AM/PM format.
 * Examples:
 * "10:00" -> "10:00 AM"
 * "21:30" -> "9:30 PM"
 * "11:00" -> "11:00 AM"
 * "21:00" -> "9:00 PM"
 */
export function formatPunchTime12(timeVal: any): string {
  if (!timeVal) return 'Not available';

  if (typeof timeVal === 'string') {
    // If it's already in 12-hour AM/PM format:
    if (/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(timeVal.trim())) {
      return timeVal.trim().toUpperCase();
    }
    // If it's "HH:MM" or "HH:MM:SS" (24-hour)
    const match = timeVal.match(/^(\d{1,2}):(\d{2})/);
    if (match && !timeVal.includes('T')) {
      const h24 = Number.parseInt(match[1], 10);
      const min = match[2];
      const period = h24 >= 12 ? 'PM' : 'AM';
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      return `${h12}:${min} ${period}`;
    }
  }

  try {
    const d = new Date(timeVal);
    if (!isNaN(d.getTime())) {
      // Format in IST / local time 12-hour format
      return d.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    }
  } catch { }

  return String(timeVal) || 'Not available';
}

/**
 * Converts 12-hour time parts (h, m, period) to "HH:MM" 24-hour string.
 */
export function to24HourString(hour12: number, minute: number, period: 'AM' | 'PM'): string {
  let h24 = hour12 % 12;
  if (period === 'PM') h24 += 12;
  const hStr = String(h24).padStart(2, '0');
  const mStr = String(minute).padStart(2, '0');
  return `${hStr}:${mStr}`;
}

/**
 * Converts "HH:MM" 24-hour string to 12-hour parts { hour12, minute, period }.
 */
export function from24HourString(time24: string): { hour12: number; minute: number; period: 'AM' | 'PM' } {
  const [hStr, mStr] = (time24 || '10:00').split(':');
  const h = Number.parseInt(hStr, 10) || 0;
  const m = Number.parseInt(mStr, 10) || 0;
  const period: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return { hour12, minute: m, period };
}

/**
 * Calculates total minutes between punchIn and punchOut (same-day 24h format).
 */
export function calculateShiftDuration(punchIn24: string, punchOut24: string): number {
  if (!punchIn24 || !punchOut24) return 0;
  const [inH, inM] = punchIn24.split(':').map((v) => Number.parseInt(v, 10) || 0);
  const [outH, outM] = punchOut24.split(':').map((v) => Number.parseInt(v, 10) || 0);
  const inTotal = inH * 60 + inM;
  const outTotal = outH * 60 + outM;
  return outTotal - inTotal;
}

/**
 * Formats tea break:
 * e.g. 0 -> "No Tea Break"
 * e.g. 20 with "Evening" -> "20 min - Evening"
 * e.g. 10 with "None" -> "10 min"
 */
export function formatTeaBreakDisplay(teaMinutes?: number | null, slot?: string | null): string {
  if (teaMinutes === undefined || teaMinutes === null || isNaN(teaMinutes)) {
    return 'Not available';
  }
  if (teaMinutes === 0) {
    return 'No Tea Break';
  }
  const cleanSlot = slot && slot.trim() !== 'None' ? slot.trim() : null;
  if (cleanSlot) {
    return `${teaMinutes} min - ${cleanSlot}`;
  }
  return `${teaMinutes} min`;
}
