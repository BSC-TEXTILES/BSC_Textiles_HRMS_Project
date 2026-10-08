/**
 * Calendar date of `d` (default: now) at UTC midnight — the safe representation
 * for Prisma `@db.Date` fields (attendanceDate, breakDate, transactionDate, ...).
 *
 * Prisma serializes JS Date values as full datetimes when talking to MySQL
 * (e.g. "2026-10-08 05:30:00"), so a local-midnight Date — which is 18:30 UTC
 * of the previous day in India — neither matches on read nor truncates to the
 * intended date on insert. UTC midnight of the LOCAL calendar date makes reads
 * and writes agree in any timezone.
 */
export function dbDate(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}
