import Brand from "@/components/brand";
import CameraWall from "@/components/sample/camera-wall";

/** Sign in, sign up and password screens: the form on the left, the cameras on the right. */
export default function AuthShell({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <main className="min-h-dvh grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-6 sm:px-12 py-8">
        <Brand live />
        <div className="flex-1 flex items-center py-12">
          <div className="w-full max-w-[400px] mx-auto">
            <h1 className="disp text-[30px] leading-[1.1]">{title}</h1>
            <p className="text-[15px] text-ink-2 mt-3 mb-8 leading-[1.6]">{sub}</p>
            {children}
          </div>
        </div>
      </div>
      <aside className="hidden lg:flex relative overflow-hidden border-l border-line bg-bg-1 items-center justify-center p-12">
        <div className="absolute inset-0 gridbg" aria-hidden />
        <div className="relative w-full max-w-[560px]">
          <CameraWall />
          <p className="disp text-[22px] mt-8 leading-[1.25]">
            Their ads, on your screen,
            <br />
            <span className="text-mint">every morning.</span>
          </p>
        </div>
      </aside>
    </main>
  );
}
