import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';
// (Keep any other imports you already have here)

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
