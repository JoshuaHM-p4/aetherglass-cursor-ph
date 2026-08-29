import type { Metadata, Viewport } from 'next';
import { Crimson_Pro, Silkscreen } from 'next/font/google';
import './globals.css';

const crimson = Crimson_Pro({
  subsets: ['latin'],
  variable: '--font-crimson',
  display: 'swap',
});

const silkscreen = Silkscreen({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-silkscreen',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'Aetherglass',
  description: 'A dungeon where the glass tells the truth.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${crimson.variable} ${silkscreen.variable}`}>
      <body>{children}</body>
    </html>
  );
}
