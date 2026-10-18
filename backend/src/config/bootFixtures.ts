/**
 * Boot-time fixture gate.
 *
 ** Several `scripts/setup*.ts` modules do two different jobs at once: they shape
 * schema/reference data (document types, salary cadres, store topology) and they
 * insert **fabricated operational rows** — invented former employees with
 * resignation and F&F amounts, demo attendance, sample late fines, demo break
 * sessions, illustrative sales transactions, fake document dossiers, and a
 * loopback terminal named `SIMMB160DEMO01`.
 *
 * Those fixtures are how the development environment and the test suites have
 * data to work with, which is legitimate. Running them from the API process on
 * every start is not: a production boot would create fictitious employees and
 * fictitious attendance, and the worker would then poll a fictitious device and
 * report on it as if it were shop-floor hardware.
 *
 * So the two are separated here:
 *   - reference/schema shaping keeps running (it is idempotent and the app needs it),
 *   - fixture seeding runs only outside production, and can be switched off
 *     entirely with `HRMS_BOOT_FIXTURES=false`.
 * Production needs an explicit opt-in (`HRMS_BOOT_FIXTURES=true`) and says so
 * loudly when it is enabled.
 */

export type BootFixturesDecision = { allowed: boolean; reason: string };

export function bootFixturesAllowed(): BootFixturesDecision {
  const explicit = String(process.env.HRMS_BOOT_FIXTURES ?? '').trim().toLowerCase();
  const isProduction = String(process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production';

  if (explicit === 'true' || explicit === '1') {
    return isProduction
      ? {
          allowed: true,
          reason: 'HRMS_BOOT_FIXTURES=true in production — demo employees, attendance, sales and the loopback terminal will be written',
        }
      : { allowed: true, reason: 'HRMS_BOOT_FIXTURES=true' };
  }

  if (explicit === 'false' || explicit === '0') {
    return { allowed: false, reason: 'HRMS_BOOT_FIXTURES=false' };
  }

  if (isProduction) {
    return {
      allowed: false,
      reason: 'production boot never seeds demo records (set HRMS_BOOT_FIXTURES=true only if you mean it)',
    };
  }

  return { allowed: true, reason: 'development boot with fixtures enabled' };
}

/** Convenience for call sites that only care about the boolean. */
export function fixturesOn(): boolean {
  return bootFixturesAllowed().allowed;
}

/**
 * Devices that exist only to exercise the integration. The worker must not poll
 * them in production, and the ops screens label them as fixtures so nobody reads
 * their punch counts as shop-floor evidence.
 */
export function fixtureDevicesAllowed(): boolean {
  return fixturesOn();
}
