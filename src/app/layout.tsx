import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import { QueryProvider } from "@/components/providers/query-provider";
import "./globals.css";

const bodyFont = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const displayFont = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Harmoney",
    template: "%s | Harmoney",
  },
  description:
    "A shared financial operating system for couples: budgets, assets, transfers, upcoming expenses, and financial literacy support.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      suppressHydrationWarning
      lang="en"
      className={`${bodyFont.variable} ${displayFont.variable} h-full antialiased`}
    >
      <body
        suppressHydrationWarning
        className="bg-background text-foreground min-h-full"
      >
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
