import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      <main className="flex flex-col relative w-full px-margin-mobile pt-16 pb-28 bg-surface">
        {children}
      </main>
      <BottomNav />
    </>
  );
}