import type { Metadata } from "next";
import { Inter, Open_Sans, Roboto } from "next/font/google";
import type { ReactNode } from "react";

import { AppSessionProvider } from "@/src/features/app-shell/app-session";

import "./globals.css";

// Inter — clean, neutral grotesque for all UI and manifesto text
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  display: "swap",
});

const openSans = Open_Sans({
  subsets: ["latin"],
  variable: "--font-brand",
  weight: ["700", "800"],
  display: "swap",
});

const roboto = Roboto({
  subsets: ["latin"],
  variable: "--font-nav",
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "OpenSocial",
  description: "The agentic social graph.",
  icons: {
    icon: [{ url: "/brand/logo.svg", type: "image/svg+xml" }],
    shortcut: "/brand/logo.svg",
    apple: [{ url: "/brand/logo.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html className={`${inter.variable} ${openSans.variable} ${roboto.variable}`} lang="en">
      <body className="font-[var(--font-heading)] text-ink antialiased">
        <AppSessionProvider>{children}</AppSessionProvider>
      </body>
    </html>
  );
}
