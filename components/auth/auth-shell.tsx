import Link from "next/link";

import Brand from "@/components/brand";

/** Sign in, sign up and password screens: one centered card. */
export default function AuthShell({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <main className="min-h-dvh flex flex-col items-center bg-subtle px-5 py-10">
      <Brand />
      <div className="flex-1 w-full flex items-center justify-center py-10">
        <div className="w-full max-w-[400px]">
          <div className="text-center mb-7">
            <h1 className="heading text-[22px]">{title}</h1>
            <p className="text-[14px] text-ink-2 mt-2 leading-[1.6]">{sub}</p>
          </div>
          <div className="card p-6 sm:p-7 shadow-[var(--shadow-md)]">{children}</div>
        </div>
      </div>
      <p className="caption">
        <Link href="/terms" className="hover:text-ink">
          Terms
        </Link>{" "}
        ·{" "}
        <Link href="/privacy" className="hover:text-ink">
          Privacy
        </Link>
      </p>
    </main>
  );
}
