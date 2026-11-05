import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'School MS', description: 'Results, report cards and exam prep for schools' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
