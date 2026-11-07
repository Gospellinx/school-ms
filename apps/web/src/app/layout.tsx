import type { Metadata, Viewport } from "next";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";

export const metadata: Metadata = {
  title: { default: "Linx School", template: "%s · Linx School" },
  description: "School management and exam prep for Nigerian schools.",
  manifest: "/manifest.webmanifest",
  applicationName: "Linx School",
  appleWebApp: { capable: true, title: "Linx School", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#6a3bf0", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
