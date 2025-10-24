import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OpenWebUI Analog",
  description: "Lightweight OpenAI-compatible web chat UI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
