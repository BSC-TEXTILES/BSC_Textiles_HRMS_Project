import { LegalPage } from '@/components/legal/LegalPage';

export const metadata = { title: 'Cookie Policy | BSC Textiles HRMS' };

export default function CookiePolicyPage() {
  return (
    <LegalPage
      title="Cookie Policy"
      summary="Which cookies this system sets, what each one does, and how long it lasts."
      updated="17 October 2026"
      sections={[
        {
          heading: 'Strictly necessary',
          body: (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Purpose</th>
                    <th className="py-2">Lifetime</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {[
                    ['__Host-bsc_at', 'Access token. HttpOnly, Secure, SameSite=Strict, scoped to this origin.', '15 minutes, rotated silently'],
                    ['__Host-bsc_rt', 'Refresh token. HttpOnly and sent only to the refresh endpoint path.', '7 days'],
                    ['csrf_token', 'Double-submit CSRF token. Readable by script by design, so the header can be echoed back.', 'Until the session ends'],
                    ['__Host-bsc_visitor', 'A random identifier used to store your cookie consent.', '13 months'],
                    ['bsc_consent', 'Your recorded consent choices, so you are not asked again.', '13 months'],
                    ['next-auth.session-token', 'Marks your UI session for the Next.js layer. Contains no API credential.', '8 hours'],
                  ].map(([name, purpose, lifetime]) => (
                    <tr key={name}>
                      <td className="py-2 pr-4 font-mono text-xs">{name}</td>
                      <td className="py-2 pr-4">{purpose}</td>
                      <td className="py-2 text-xs">{lifetime}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ),
        },
        {
          heading: 'Analytics (optional)',
          body: (
            <p>
              Aggregate page usage only, off until you allow it. No page containing payroll or statutory identifiers is
              instrumented, and no analytics payload includes your name, employee code or any document content.
            </p>
          ),
        },
        {
          heading: 'Preferences (optional)',
          body: (
            <p>
              Remembers the collapsed sidebar, the selected store hub and the light/dark theme in this browser. Turning
              it off simply means the system asks you again each visit.
            </p>
          ),
        },
        {
          heading: 'Changing your choice',
          body: (
            <p>
              Use the banner at the bottom of any page, or <em>My privacy</em> once signed in. Necessary cookies cannot
              be switched off — without them the system cannot tell that your requests belong to your session, and it
              would refuse to sign you in.
            </p>
          ),
        },
        {
          heading: 'No third-party trackers',
          body: (
            <p>
              We do not place advertising cookies or cross-site trackers. Static assets may be served from a CDN; that
              request carries your IP address and nothing identifying about your account.
            </p>
          ),
        },
      ]}
    />
  );
}
