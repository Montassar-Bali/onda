import "./globals.css";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import { ServiceWorker } from "@/components/ServiceWorker";

// Self-hosted (no build-time download from Google Fonts, which can fail on CI/Vercel).
const jakarta = localFont({
  src: [
    { path: "./fonts/jakarta-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/jakarta-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/jakarta-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/jakarta-700.woff2", weight: "700", style: "normal" },
    { path: "./fonts/jakarta-800.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "ONDA Tickets", template: "%s · ONDA Tickets" },
  description: "ONDA — festival tickets in Tunisia. Cash sales, TND.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};
export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#140b0d" }, { media: "(prefers-color-scheme: dark)", color: "#0a0607" }],
  width: "device-width", initialScale: 1, viewportFit: "cover",
};

/** Runs before first paint: applies the saved theme (or the system one) so there is no flash. */
const themeScript = `(function(){try{var t=localStorage.getItem("tropical-theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){}})()`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined; // set per request by middleware (CSP)
  return (
    <html lang="fr" className={jakarta.variable} data-theme="light" suppressHydrationWarning>
      {/* browsers blank the nonce attribute after use, so React must not compare it */}
      <head><script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className="min-h-dvh font-sans">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
