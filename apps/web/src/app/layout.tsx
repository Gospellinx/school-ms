import type { Metadata, Viewport } from "next";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Linx School", template: "%s · Linx School" },
  description: "School management and exam prep for Nigerian schools.",
};

export const viewport: Viewport = { themeColor: "#6a3bf0", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG">
      <body>{children}</body>
    </html>
  );
}
