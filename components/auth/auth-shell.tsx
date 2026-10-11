import "@/app/read.css";

import Brand from "@/components/brand";

export default function AuthShell({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <main className="rd min-h-dvh flex flex-col">
      <nav className="rd-nav">
        <Brand live />
      </nav>
      <div className="flex-1 flex items-center justify-center py-12 px-5"
       
      >
        <div className="card-lg w-full max-w-[420px] py-10 px-[34px]">
          <h1 className="h-disp text-[24px] mx-0 mt-0 mb-2">
            {title}
          </h1>
          <p className="text-[14.5px] text-ink-soft mx-0 mt-0 mb-[26px] leading-[1.55]">
            {sub}
          </p>
          {children}
        </div>
      </div>
    </main>
  );
}
