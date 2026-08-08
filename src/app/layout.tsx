import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Popper — Adversarial Claim Verification',
  description: 'Adversarial multi-agent system that verifies factual claims in research papers against real citation sources.',
};

import { AOSInit } from '@/components/AOSInit';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
      </head>
      <body>
        <AOSInit />
        {children}
      </body>
    </html>
  );
}
