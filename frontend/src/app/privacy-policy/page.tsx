import { LegalPage } from '@/components/legal/LegalPage';

export const metadata = { title: 'Privacy Policy | BSC Textiles HRMS' };

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      summary="What the HRMS holds about you, why it holds it, and what you can ask it to do."
      updated="17 October 2026"
      sections={[
        {
          heading: 'Who we are',
          body: (
            <p>
              BSC Textiles Pvt. Ltd. (&ldquo;BSC&rdquo;, &ldquo;we&rdquo;) operates this HRMS for its workforce across
              the Karnataka retail network. Data controller enquiries: security@bsctextiles.com.
            </p>
          ),
        },
        {
          heading: 'What we collect, and why',
          body: (
            <>
              <p>We limit collection to what an employment record and a secure login actually need:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <strong>Identity and contact</strong> — name, work email, phone, address, date of birth. Needed to
                  employ you and to reach you about shift and payroll matters.
                </li>
                <li>
                  <strong>Statutory identifiers</strong> — Aadhaar, PAN, UAN, bank details. Collected under labour and
                  tax law, stored encrypted, and visible only to roles with the payroll or document grant.
                </li>
                <li>
                  <strong>Attendance and biometric verification</strong> — punch times, verification method and, where
                  the terminal supports it, a snapshot. Collected on company devices for the purpose of recording
                  attendance.
                </li>
                <li>
                  <strong>Security telemetry</strong> — sign-in attempts, IP address, user agent, session records and
                  audit entries. Collected to protect accounts.
                </li>
              </ul>
            </>
          ),
        },
        {
          heading: 'How access is controlled',
          body: (
            <p>
              Every screen and API call is checked against your assigned role and the module permissions that role
              holds. A Floor Manager sees their own team; an employee sees their own record; payroll identifiers are
              masked in listings and shown in full only where the role grants access to them.
            </p>
          ),
        },
        {
          heading: 'Your rights',
          body: (
            <p>
              You may request a copy of your data, correction of it, a restriction on processing, or erasure. Raise a
              request by email. We verify identity before acting, and we explain what
              cannot be deleted and why — statutory payroll, attendance and audit records are retained for the period in
              the Data Retention Policy even after an erasure request, at which point the identifying fields are masked
              so the record can no longer be attributed to you.
            </p>
          ),
        },
        {
          heading: 'Cookies',
          body: (
            <p>
              We use strictly necessary cookies for the session and CSRF protection, and optional analytics and
              preference cookies only with your consent. See the Cookie Policy.
            </p>
          ),
        },
        {
          heading: 'Security',
          body: (
            <p>
              Passwords are salted and hashed with Argon2id plus a server-side pepper and are never recoverable,
              including by our administrators. Sessions use HttpOnly, SameSite=Strict cookies with idle and absolute
              timeouts, failed-attempt lockouts, rate limiting and a tamper-evident audit log. If a breach affects your
              data we will notify you and the relevant authority as required by law.
            </p>
          ),
        },
      ]}
    />
  );
}
