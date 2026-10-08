import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: 'BSC Textiles HRMS',
    template: '%s | BSC Textiles HRMS',
  },
  description: 'BSC Textiles HRMS - Next Generation Workforce Management System',
  keywords: ['BSC Textiles', 'HRMS', 'Workforce Management', 'Attendance', 'Payroll', 'HR'],
  authors: [{ name: 'BSC Textiles' }],
  creator: 'BSC Textiles',
  publisher: 'BSC Textiles',
  robots: 'index, follow',
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: 'https://bsctextiles.com',
    siteName: 'BSC Textiles HRMS',
    title: 'BSC Textiles HRMS',
    description: 'Next Generation Workforce Management System',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BSC Textiles HRMS',
    description: 'Next Generation Workforce Management System',
  },
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className={`${inter.variable} font-sans antialiased h-full bg-gray-50`} suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}