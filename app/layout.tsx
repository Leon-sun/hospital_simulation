import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Hospital Scheduling Simulation",
  description: "Dashboard for simulated hospital event scheduling and backlog KPIs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
