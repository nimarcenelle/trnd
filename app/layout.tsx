import type { Metadata, Viewport } from "next";

// Self-hosted: Figtree for reading, Unbounded for the big words, JetBrains Mono for labels and timestamps.
import "@fontsource-variable/figtree/index.css";
import "@fontsource-variable/jetbrains-mono/index.css";
import "@fontsource/unbounded/600.css";
import "@fontsource/unbounded/800.css";

import DismissPopovers from "@/components/dismiss-popovers";

import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://creators.usetrnd.com";
const TITLE = "TRND for creators: know exactly what to post next";
const DESCRIPTION =
  "TRND reads your TikTok, what's working for creators a step ahead of you and what's rising in your niche, then gives you the hook, script, sound and hashtags for your next three videos.";

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
    { media: "(prefers-color-scheme: light)", color: "#f7f5f8" },
    { media: "(prefers-color-scheme: dark)", color: "#110e14" },
  ],
};

/** Applies a saved theme before first paint so there is no flash. */
const themeInit = `try{var t=localStorage.getItem("trnd-theme");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        {children}
        <DismissPopovers />
      </body>
    </html>
  );
}
