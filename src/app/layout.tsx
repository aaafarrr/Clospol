import type { Metadata } from "next";
import "./globals.css";
import PrelineScript from "@/components/PrelineScript";

export const metadata: Metadata = {
  title: "Clospol - Multi-Cloud Storage Gateway",
  description: "Unify Google Drive, AWS S3, and Local storage into a single secure virtual workspace with automatic storage tiering.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script src="/libs/hls/hls.min.js" defer></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const theme = localStorage.getItem('theme') || 'light';
                if (theme === 'dark') {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              })();
            `,
          }}
        />
      </head>
      <body>
        {children}
        <PrelineScript />
      </body>
    </html>
  );
}

