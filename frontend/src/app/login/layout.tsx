import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Staff Portal Sign In',
  description: 'Authorized Staff and Executive sign in gateway for BSC Textiles workforce management system.',
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
