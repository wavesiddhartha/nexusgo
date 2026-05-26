import type { Metadata, Viewport } from 'next';
import { DM_Sans, DM_Mono }       from 'next/font/google';
import { Toaster }                 from 'sonner';
import './globals.css';

const dmSans = DM_Sans({
  subsets:  ['latin'],
  variable: '--font-sans',
  weight:   ['300', '400', '500'],
  display:  'swap',
});

const dmMono = DM_Mono({
  subsets:  ['latin'],
  variable: '--font-mono',
  weight:   ['300', '400'],
  display:  'swap',
});

export const metadata: Metadata = {
  title:       'NEXUS — Peer-to-Peer Connection',
  description: 'Instant, private, serverless communication. No accounts. No cloud.',
  manifest:    '/manifest.json',
  metadataBase: new URL('https://nexusgo.me'),
  openGraph: {
    title:       'NEXUS — nexusgo.me',
    description: 'Instant peer-to-peer communication. No accounts. No cloud.',
    url:         'https://nexusgo.me',
    siteName:    'NEXUS',
    type:        'website',
  },
  twitter: {
    card:        'summary',
    title:       'NEXUS',
    description: 'Instant peer-to-peer communication. No accounts. No cloud.',
  },
  other: {
    'mobile-web-app-capable':          'yes',
    'apple-mobile-web-app-capable':    'yes',
    'apple-mobile-web-app-title':      'NEXUS',
    'apple-mobile-web-app-status-bar': 'default',
  },
};

export const viewport: Viewport = {
  width:           'device-width',
  initialScale:    1,
  maximumScale:    1,
  userScalable:    false,
  themeColor:      '#ffffff',
  viewportFit:     'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${dmMono.variable}`}>
      <body className="font-sans antialiased bg-white text-black">
        {children}
        <Toaster
          position="bottom-center"
          offset={84}
          toastOptions={{
            style: {
              background:    '#080808',
              color:         '#fff',
              border:        'none',
              borderRadius:  '100px',
              fontFamily:    'var(--font-mono)',
              fontSize:      '11px',
              fontWeight:    '300',
              letterSpacing: '0.025em',
              padding:       '10px 18px',
              boxShadow:     '0 4px 28px rgba(0,0,0,0.18)',
            },
          }}
        />
      </body>
    </html>
  );
}
