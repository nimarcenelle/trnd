import type { Metadata, Viewport } from "next";

// Self-hosted fonts (shipped with the app — no font CDN dependency at all).
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";

import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://usetrnd.com";
const TITLE = "TRND — Know what to advertise, before your competitors do";
const DESCRIPTION =
  "TRND reads real-time demand signal and turns it into a finished ad campaign for your business — every day. Built for small businesses, not agencies.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  // og:image / twitter:image come from app/opengraph-image.tsx (generated at
  // build, always in step with the slogan) — no listing here, or the stale
  // static file would win.
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    siteName: "TRND",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = { themeColor: "#14100C" };

/** Applies a saved theme override before first paint so there is no flash. */
const themeInit = `try{var t=localStorage.getItem("trnd-theme");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
