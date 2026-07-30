import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { AuthSessionRefresh } from "@/components/AuthSessionRefresh";
import { GoogleAnalytics } from "@/components/GoogleAnalytics/GoogleAnalytics";
import { PwaRegistration } from "@/components/PwaRegistration/PwaRegistration";
import "./globals.css";

const themeInitScript = `
  try {
    var savedTheme = window.localStorage.getItem("wca-rankings-theme");
    var theme = savedTheme === "dark" || savedTheme === "light"
      ? savedTheme
      : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (error) {}
`;

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);

  return {
    metadataBase,
    title: "WCA Rankings",
    description: "Browse official World Cube Association rankings by event and result type.",
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      title: "WCA Rankings",
      statusBarStyle: "default",
    },
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg", apple: "/icon-192.png" },
    openGraph: {
      title: "WCA Rankings",
      description: "Browse official World Cube Association rankings.",
      type: "website",
      url: metadataBase,
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fffcff" },
    { media: "(prefers-color-scheme: dark)", color: "#121417" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <style>{`
          html { background: #fffcff; }
          html[data-theme="dark"] { background: #121417; }
          body { visibility: visible; }
        `}</style>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <AuthSessionRefresh />
        <GoogleAnalytics />
        <PwaRegistration />
        {children}
      </body>
    </html>
  );
}
