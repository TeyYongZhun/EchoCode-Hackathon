import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'EchoCode',
  description: 'The voice-first AI pair programmer for VS Code.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0a0e14', color: '#d7e3f4', fontFamily: 'system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
