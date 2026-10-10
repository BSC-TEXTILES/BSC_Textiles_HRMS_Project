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
    icon: [
      { url: '/favicon.png', type: 'image/png' },
      { url: '/images/bsc_logo.png', type: 'image/png' },
    ],
    shortcut: '/favicon.png',
    apple: '/favicon.png',
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
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="shortcut icon" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/favicon.png" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('bsc_theme');if(t==='dark'){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}else{document.documentElement.classList.remove('dark');document.documentElement.style.colorScheme='light';}}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${jakarta.className} font-sans antialiased h-full bg-[#f8f9ff] dark:bg-[#090e17] text-[#0b1c30] dark:text-slate-100 transition-colors duration-300`} suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}