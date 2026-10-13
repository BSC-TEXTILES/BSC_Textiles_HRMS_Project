import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Executive Workforce & Operations Dashboard',
  description: 'Enterprise HRMS operations, real-time biometric attendance telemetry, Karnataka enterprise store hubs adherence, and payroll disbursal dashboard for BSC Textiles.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function DashboardLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
