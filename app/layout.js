import './globals.css';

export const metadata = {
  title: 'Mr. Cleaner Mobile Detailing | Premium Car Care in Texas',
  description: 'Pro mobile detailing services in Texas. Book your car wash, interior detail, or ceramic coating in 60 seconds with Maya, our AI assistant.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
