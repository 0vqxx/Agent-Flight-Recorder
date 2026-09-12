import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Agent Flight Recorder | Observability Workbench',
  description: 'High-Performance Developer Observability & Distributed Tracing for AI Agents',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full">
      <body className="h-full bg-[#090a0c] text-zinc-100 overflow-hidden select-none">
        {children}
      </body>
    </html>
  );
}
