import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "Sector Galactica",
  description:
    "Interactive 3D map of the Galactica ecosystem. Contracts and capital flows. Visualized.",
  openGraph: {
    title: "Sector Galactica",
    description: "Contracts and capital flows. Visualized.",
    images: ["/image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sector Galactica",
    description: "Contracts and capital flows. Visualized.",
    images: ["/image.png"],
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
