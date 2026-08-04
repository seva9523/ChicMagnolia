import type { Metadata } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';

import { PrivacySafeAnalytics } from '@/components/privacy-safe-analytics';
import { CANONICAL_APP_ORIGIN } from '@/lib/canonical-url';

import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  metadataBase: new URL(CANONICAL_APP_ORIGIN),
  title: 'Chic Magnolia',
  description: 'Never miss a price drop within your return window.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${playfair.variable}`}>
        {children}
        <PrivacySafeAnalytics />
      </body>
    </html>
  );
}
