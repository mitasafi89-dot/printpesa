import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppShell } from '@/components/layout/AppShell';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: 'PrintPesa',
  description: 'Real-money trade-prediction game — predict BUY/SELL on the live BTC/KES curve.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0a0b0e',
};

// Apply the stored theme before paint to avoid a flash. Dark-first by default.
const themeInit = `(function(){try{if(localStorage.getItem('pp-theme')==='light'){document.documentElement.classList.add('light');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
