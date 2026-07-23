import type { ReactNode } from "react";
import NavShell from "@/components/NavShell";
import { ProfileProvider } from "@/lib/context/ProfileContext";

export default function AppGroupLayout({ children }: { children: ReactNode }) {
  return (
    <ProfileProvider>
      <NavShell>{children}</NavShell>
    </ProfileProvider>
  );
}
