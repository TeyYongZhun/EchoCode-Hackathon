import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'EchoCode: the voice-first AI pair programmer',
  description:
    'Hold one key in VS Code and ask out loud. EchoCode answers in plain language, looks across your project, opens the file the answer is about and highlights the lines as it says them. Powered by AssemblyAI.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
