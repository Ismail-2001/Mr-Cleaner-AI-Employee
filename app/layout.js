import './globals.css';
import RootErrorBoundary from '@/components/RootErrorBoundary';
import SmoothScroll from '@/components/SmoothScroll';

export const metadata = {
  title: 'Mr. Cleaner Mobile Detailing | Premium Car Care in Texas',
  description: 'Pro mobile detailing services in Texas. Book your car wash, interior detail, or ceramic coating in 60 seconds with Maya, our AI assistant.',
  keywords: ['mobile detailing', 'car wash', 'ceramic coating', 'Texas', 'Austin', 'Dallas', 'Houston', 'AI booking', 'car care'],
  authors: [{ name: 'Mr. Cleaner Mobile Detailing' }],
  openGraph: {
    title: 'Mr. Cleaner Mobile Detailing | Premium Car Care in Texas',
    description: 'Pro mobile detailing services in Texas. Book your car wash, interior detail, or ceramic coating in 60 seconds with Maya, our AI assistant.',
    type: 'website',
    locale: 'en_US',
    siteName: 'Mr. Cleaner Mobile Detailing',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mr. Cleaner Mobile Detailing | Premium Car Care in Texas',
    description: 'Pro mobile detailing services in Texas. Book your car wash, interior detail, or ceramic coating in 60 seconds with Maya, our AI assistant.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <SmoothScroll>
          <RootErrorBoundary>
            {children}
          </RootErrorBoundary>
        </SmoothScroll>
      </body>
    </html>
  );
}
