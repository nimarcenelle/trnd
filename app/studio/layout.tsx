import Link from "next/link";

import Brand from "@/components/brand";
import ThemeToggle from "@/components/theme-toggle";
import { requireAdmin } from "@/lib/creator/admin";

export const metadata = { title: "Studio — TRND", robots: { index: false } };

/** The creator funnel's back room: its numbers and the teardowns made as content. ADMIN_EMAILS only. */
export default async function StudioLayout({ children }: LayoutProps<"/studio">) {
  await requireAdmin();
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="border-b border-line">
        <div className="wrap flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <Brand href="/studio" />
            <span className="caption">Creator studio</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <Link href="/creators" className="btn btn-ghost btn-sm">
              Public page
            </Link>
          </div>
        </div>
      </header>
      <main className="wrap py-10 flex-1 w-full">{children}</main>
    </div>
  );
}
