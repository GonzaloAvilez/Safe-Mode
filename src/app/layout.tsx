import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getLocale } from "next-intl/server";
import { ExperienceProviders } from "./_components/experience-state/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Refugio",
  // `apple` is listed here because this explicit `icons` stops Next from adding the
  // apple-icon.png file's link on its own.
  icons: { icon: "/icon.png", apple: "/apple-icon.png" },
  // ADR-005: once installed on an iPhone's Home Screen, Refugio opens as its own app (where iOS
  // delivers web push), with the apple-icon.png above as its Home Screen icon. An opaque black status
  // bar, not "black-translucent": that one would draw the page under the bar, and the fixed
  // language selector would sit beneath the clock.
  appleWebApp: { capable: true, title: "Refugio", statusBarStyle: "black" },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ExperienceProviders>{children}</ExperienceProviders>
      </body>
    </html>
  );
}
