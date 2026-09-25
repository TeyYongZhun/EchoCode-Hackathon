import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'EchoCode: the voice-first AI pair programmer',
  description:
    'Highlight code in VS Code, hold a key and ask out loud. EchoCode explains it back out loud, powered by AssemblyAI.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
