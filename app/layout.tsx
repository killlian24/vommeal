import type { Metadata, Viewport } from 'next'
import './globals.css'
import Navigation from '@/components/Navigation'
import { UserProvider } from '@/components/UserProvider'
import { ServiceWorker } from '@/components/ServiceWorker'
import { ToastProvider } from '@/components/Toast'

export const metadata: Metadata = {
  title: 'Vommeal',
  description: 'Essensplanung und Einkauf für zwei',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/icon-180.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Vommeal',
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
  // Draw under the status bar and home indicator of the installed iPhone app
  // (black-translucent); the insets are padded in globals.css.
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className="dark">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-screen flex flex-col">
        <ToastProvider>
          <UserProvider>
            <div className="flex flex-col min-h-screen md:flex-row overflow-x-hidden">
              <Navigation />
              <main className="flex-1 md:ml-56 pb-tabbar min-w-0">
                <div className="max-w-4xl mx-auto px-4 pt-page pb-6 page-enter w-full">
                  {children}
                </div>
              </main>
            </div>
          </UserProvider>
        </ToastProvider>
        <ServiceWorker />
      </body>
    </html>
  )
}
