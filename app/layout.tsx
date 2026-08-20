import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";

const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-serif",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#050505",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://leaberlin.com"),
  title: "Lea · Berlin",
  description: "schreibt zu viel. kocht zu viel pasta. sitzt zu oft alleine an der bar.",
  openGraph: {
    title: "Lea · Berlin",
    description: "schreibt zu viel. kocht zu viel pasta. sitzt zu oft alleine an der bar.",
    url: "https://leaberlin.com",
    siteName: "Lea",
    locale: "de_DE",
    type: "website",
    images: ["/images/hero.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lea · Berlin",
    description: "schreibt zu viel. kocht zu viel pasta. sitzt zu oft alleine an der bar.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className={`${sans.variable} ${serif.variable}`}>{children}</body>
    </html>
  );
}
