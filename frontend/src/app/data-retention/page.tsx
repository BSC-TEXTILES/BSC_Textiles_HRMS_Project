import { LegalPage } from '@/components/legal/LegalPage';

export const metadata = { title: 'Data Retention Policy | BSC Textiles HRMS' };

export default function DataRetentionPolicyPage() {
  return (
    <LegalPage
      title="Data Retention Policy"
      summary="How long each class of record is kept, what happens at the end of that period, and what the law forces us to keep longer."
      updated="17 October 2026"
      sections={[
        {
          heading: 'Retention schedule',
          body: (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="py-2 pr-4">Record</th>
                    <th className="py-2 pr-4">Kept for</th>
                    <th className="py-2">Why</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {[
                    ['Employment and payroll records', '8 years after exit', 'Companies Act, income-tax and labour inspection'],
                    ['Statutory muster and attendance', '8 years', 'Factories Act record-keeping'],
                    ['Audit trail (logins, permission and credential changes)', '730 days', 'Security investigation and accountability'],
                    ['Login attempts (including failures)', '180 days', 'Brute-force and spray detection'],
                    ['Session records', '90 days after the session ends', 'Session forensics and the admin session list'],
                    ['Revoked / rotated refresh tokens', '30 days after expiry', 'Reuse detection window'],
                    ['Biometric raw punch ledger', '730 days', 'Re-computation of attendance without the device'],
                    ['Cookie consent records', 'Until withdrawn plus 12 months', 'Proof of the choice you made'],
                    ['CCTV and terminal snapshots', '90 days', 'Dispute resolution for attendance corrections'],
                  ].map(([record, period, why]) => (
                    <tr key={record}>
                      <td className="py-2 pr-4 font-medium">{record}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{period}</td>
                      <td className="py-2 text-xs">{why}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ),
        },
        {
          heading: 'Automatic purge',
          body: (
            <p>
              A scheduled job deletes rows past their window using the table above, which an administrator can adjust
              without a deploy, and records what it removed in the audit log. Purges run in bounded batches so a
              long-overdue cleanup cannot lock the database.
            </p>
          ),
        },
        {
          heading: 'What an erasure request does',
          body: (
            <p>
              We cannot delete a payroll or attendance line without destroying a statutory record we are required to
              keep, so an erasure request <strong>masks</strong> you instead: your name, contact details, address and
              statutory identifiers are replaced with non-attributable values, your login ID is removed, and the
              personal artefacts that have no retention requirement — sessions, refresh tokens, password history, MFA
              devices, device fingerprints, consent records — are deleted outright. The remaining ledger rows can no
              longer be linked to you.
            </p>
          ),
        },
        {
          heading: 'Backups',
          body: (
            <p>
              Encrypted backups are retained for 35 days and roll off automatically, so data removed from the live
              system disappears from backup within that window. Restoring a backup after an erasure re-applies the
              erasure as part of the restore runbook.
            </p>
          ),
        },
        {
          heading: 'Security logs kept longer than the rest',
          body: (
            <p>
              Audit entries are deliberately retained for two years: they are the evidence that a change was authorised.
              They contain acting account, IP, entity and old/new values — never passwords or tokens.
            </p>
          ),
        },
      ]}
    />
  );
}
