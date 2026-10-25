import { Suspense } from "react";
import { AppShell } from "@/components/app/shell";
import { Loading } from "@/components/ui";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // The shell reads the URL and session on the client, so it streams in behind this boundary.
  return (
    <Suspense fallback={<Loading label="Opening your health vault" />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
