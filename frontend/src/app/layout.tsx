import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const jakarta = Plus_Jakarta_Sans({ 
  subsets: ['latin'],
  display: 'optional',
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
    <html lang="en" className="h-full" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap" />
      </head>
      <body className={`${jakarta.className} font-sans antialiased h-full bg-[#f8f9ff] text-[#0b1c30]`} suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}