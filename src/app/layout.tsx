import type { Metadata } from "next";
import "./globals.css";


export const metadata: Metadata = {
  title: "Globentir | Realtime OSINT",
  description: "A real-time OSINT dashboard for flights, ships, satellites, drones...etc.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-black overflow-hidden">{children}</body>
    </html>
  );
}
