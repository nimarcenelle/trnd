import type { Metadata, Viewport } from "next";

// Self-hosted: Inter for everything you read, JetBrains Mono for script timestamps and hashtags. Jost (the wordmark) loads below.
import "@fontsource-variable/inter/opsz.css";
import "@fontsource-variable/jetbrains-mono/index.css";

import DismissPopovers from "@/components/dismiss-popovers";

import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://creators.usetrnd.com";
const TITLE = "TRND for creators: know exactly what to post next";
const DESCRIPTION =
  "TRND finds the creators a step ahead of you in your niche and turns what got them there into your next three TikToks: the hook, script, sound and hashtags, from public data only.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  // og:image comes from app/opengraph-image.tsx.
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/", siteName: "TRND for creators", type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0c" },
  ],
};

/** Applies a saved theme before first paint so there is no flash. */
const themeInit = `try{var t=localStorage.getItem("trnd-theme");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        {/* Jost draws the TRND wordmark only, as on usetrnd.com. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jost:wght@500&display=swap" />
      </head>
      <body>
        {children}
        <DismissPopovers />
      </body>
    </html>
  );
}
