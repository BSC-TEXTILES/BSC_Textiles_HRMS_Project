import { LegalPage } from '@/components/legal/LegalPage';

export const metadata = { title: 'Terms of Use | BSC Textiles HRMS' };

export default function TermsOfUsePage() {
  return (
    <LegalPage
      title="Terms of Use"
      summary="The rules for using the BSC Textiles HRMS. Access is a condition of employment, not a public service."
      updated="17 October 2026"
      sections={[
        {
          heading: 'Authorised use',
          body: (
            <p>
              Accounts are issued by an administrator. You may use the system only for the role you are assigned, only
              for BSC business, and only from systems you are permitted to use. Credentials are personal: never share a
              login ID or password, and never sign in as someone else.
            </p>
          ),
        },
        {
          heading: 'What you must not do',
          body: (
            <ul className="list-disc space-y-1 pl-5">
              <li>Attempt to access data or functions your role has not been granted.</li>
              <li>Probe, scan, rate-limit-evade or attempt to disable the service.</li>
              <li>Submit false attendance, corrections or leave requests, or assist another person to do so.</li>
              <li>Reuse a password that has appeared in a known breach.</li>
              <li>Remove or alter audit records, or export data outside your role&rsquo;s purpose.</li>
            </ul>
          ),
        },
        {
          heading: 'Monitoring and audit',
          body: (
            <p>
              Sign-in attempts, sessions, permission denials and every change to a role or credential are logged with
              the acting account, IP address and old/new values. Logs are tamper-evident and may be reviewed by
              administrators, security staff, and where required by law.
            </p>
          ),
        },
        {
          heading: 'Session limits',
          body: (
            <p>
              Sessions end after a period of inactivity and no later than the absolute session limit, both published in
              the sign-in screen&rsquo;s security notice. Save your work; the system will not hold a session open past
              the deadline.
            </p>
          ),
        },
        {
          heading: 'Suspension and termination',
          body: (
            <p>
              BSC may suspend or deactivate an account immediately where there is a security concern. On leaving
              employment, credentials are deactivated as part of exit clearance and your record is retained under the
              Data Retention Policy.
            </p>
          ),
        },
        {
          heading: 'Availability',
          body: (
            <p>
              The service is provided on a best-efforts basis for business use. Planned maintenance is announced; the
              biometric sync worker may lag during network interruption and back-fills automatically once a terminal
              is reachable again.
            </p>
          ),
        },
      ]}
    />
  );
}
