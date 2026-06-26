import type { Metadata, Viewport } from 'next';
import { Public_Sans } from 'next/font/google';
import { ChunkLoadRecovery } from '@/components/ChunkLoadRecovery';
import { ThemeProvider } from '@/components/ThemeProvider';
import './globals.css';

const publicSans = Public_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'] });

export const metadata: Metadata = {
  title: 'Visioryx - AI Surveillance Dashboard',
  description: 'AI Powered Real-Time Face Recognition & Surveillance System',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'Visioryx',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b1326',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </head>
      <body className={publicSans.className} suppressHydrationWarning>
        <ChunkLoadRecovery />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
