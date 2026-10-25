import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Loop — Good company. Better way home.",
  description:
    "Find campus carpools, share the journey, and manage your seat requests.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
