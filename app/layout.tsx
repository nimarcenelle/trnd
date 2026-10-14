import type { Metadata, Viewport } from "next";

// One typeface, self-hosted: Inter with its optical-size axis, so headlines
// and 12px table text are each drawn for their size.
import "@fontsource-variable/inter/opsz.css";

import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://usetrnd.com";
const TITLE = "TRND: Competitor ad intelligence for Meta";
const DESCRIPTION =
  "TRND watches what your competitors do every day and tells you what to do next: where to get ahead, stand out, or fight back.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  // og:image comes from app/opengraph-image.tsx.
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/", siteName: "TRND", type: "website" },
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
        {/* Jost draws the TRND wordmark only. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jost:wght@500&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
