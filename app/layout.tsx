import type { Metadata, Viewport } from "next";

// One typeface, self-hosted: Inter with its optical-size axis, so headlines
// and 12px table text are each drawn for their size.
import "@fontsource-variable/inter/opsz.css";

import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://admitted.usetrnd.com";
const TITLE = "Admitted: your real admit odds, and the part you can still move";
const DESCRIPTION =
  "Admit odds at every school on your list from published college data, split into what your stats decided and what your application can still change.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  // og:image comes from app/opengraph-image.tsx.
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/", siteName: "Admitted", type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5f0" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0c" },
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
      <body>{children}</body>
    </html>
  );
}
