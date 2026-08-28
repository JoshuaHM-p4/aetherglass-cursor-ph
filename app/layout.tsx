import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Aetherglass',
  description: 'A dungeon where the glass tells the truth.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
