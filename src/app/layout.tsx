import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Session Hub - Claude Code Manager',
  description: 'Web interface for managing persistent Claude Code sessions',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background antialiased">{children}</body>
    </html>
  );
}
