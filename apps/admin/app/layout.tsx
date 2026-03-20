import type { Metadata } from "next";
import { Space_Grotesk, Source_Sans_3 } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const headingFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

const bodyFont = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "OpenSocial Admin",
  description: "Operational dashboard for OpenSocial",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      className={`dark ${headingFont.variable} ${bodyFont.variable}`}
      lang="en"
      suppressHydrationWarning
    >
      <body className="font-[var(--font-body)] text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
