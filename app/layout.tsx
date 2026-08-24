import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TRND — Know what to advertise, before your competitors do",
  description:
    "TRND reads real-time demand signal and turns it into a finished ad campaign for your business — every day. Built for small businesses, not agencies.",
};

/** Applies a saved theme override before first paint so there is no flash. */
const themeInit = `try{var t=localStorage.getItem("trnd-theme");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Loaded as a stylesheet (not next/font) so builds never depend on
            network access to Google Fonts, and loaded async (media="print"
            swap) so a slow font CDN can never block first paint — every
            family has a real fallback stack. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
          media="print"
          data-font-swap
        />
        <script
          dangerouslySetInnerHTML={{
            __html:
              'var l=document.querySelector("link[data-font-swap]");if(l){var s=function(){l.media="all"};l.addEventListener("load",s);if(l.sheet)s();}',
          }}
        />
        <noscript>
          <link
            href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
            rel="stylesheet"
          />
        </noscript>
      </head>
      <body>{children}</body>
    </html>
  );
}
