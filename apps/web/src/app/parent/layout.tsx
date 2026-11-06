import { AppShell } from "@/components/shell/app-shell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AppShell role="parent">{children}</AppShell>;
}
