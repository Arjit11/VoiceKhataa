import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VoiceKhata",
  description: "Hands-free credit ledger for Indian kirana shopkeepers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-white text-gray-900 min-h-screen">
        {children}
      </body>
    </html>
  );
}
