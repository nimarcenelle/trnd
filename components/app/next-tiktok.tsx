import { hookScale, type NextTikTok as Data } from "@/lib/preview/next-tiktok";

import { avatarTone } from "./avatar";

/** Generic like, comment and share shapes. No counts: the video doesn't exist yet. */
function Rail({ handle, locked }: { handle: string; locked: boolean }) {
  const icon = "w-[8cqw] h-[8cqw]";
  const tone = avatarTone(handle);
  return (
    <div aria-hidden className={`absolute right-[3.5cqw] bottom-[24cqw] flex flex-col items-center gap-[4.5cqw] ${locked ? "blur-[1cqw] opacity-70" : ""}`}>
      <span className="grid place-items-center rounded-full font-bold w-[12cqw] h-[12cqw] text-[5cqw] ring-[0.5cqw] ring-on-night" style={{ background: tone.background, color: tone.color }}>
        {tone.letter}
      </span>
      <svg viewBox="0 0 24 24" className={icon} fill="currentColor">
        <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4h2c.7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21Z" />
      </svg>
      <svg viewBox="0 0 24 24" className={icon} fill="currentColor">
        <path d="M12 3.5c5 0 9 3.4 9 7.7s-4 7.7-9 7.7c-1 0-2-.1-2.9-.4L4.5 20.5l1.2-3.9C4 15.2 3 13.3 3 11.2 3 6.9 7 3.5 12 3.5Z" />
      </svg>
      <svg viewBox="0 0 24 24" className={icon} fill="currentColor">
        <path d="M13.5 4.5 21.5 12l-8 7.5v-4.3c-5 0-8.3 1.4-10.5 4.8.6-5.6 3.6-10 10.5-10.8V4.5Z" />
      </svg>
    </div>
  );
}

function Note() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="w-[3.6cqw] h-[3.6cqw] shrink-0" fill="currentColor">
      <path d="M6 2.5 14 1v9.5a2.3 2.3 0 1 1-1.5-2.1V4.2L7.5 5.1v7.4A2.3 2.3 0 1 1 6 10.4V2.5Z" />
    </svg>
  );
}

/**
 * The creator's next idea drawn as a phone screen: their initial and handle,
 * the hook as on-screen text, the caption, hashtags and sound at the bottom.
 * TikTok-like, not TikTok: no logos, icons or fonts of theirs. Locked shows the
 * hook only; the rest is placeholder bars, so nothing paid sits in the page.
 */
export default function NextTikTok({
  data,
  locked = false,
  tint = "var(--brand)",
  cover = null,
}: {
  data: Pick<Data, "handle" | "hook"> & Partial<Data>;
  locked?: boolean;
  /** The idea type's color: the glow behind the frame. */
  tint?: string;
  /** The cover of the video this idea builds on, blurred behind the hook; a broken or missing link leaves the glow. */
  cover?: string | null;
}) {
  const scale = hookScale(data.hook);
  return (
    <figure
      className="@container relative m-0 aspect-[9/16] w-full overflow-hidden rounded-[20px] text-[#f7f5f8] select-none shadow-[0_24px_48px_-24px_rgba(23,19,27,0.55)]"
      style={{
        background: `radial-gradient(90% 55% at 15% 8%, color-mix(in srgb, ${tint} 55%, transparent), transparent 70%), radial-gradient(80% 50% at 95% 95%, color-mix(in srgb, #45c6d8 30%, transparent), transparent 70%), linear-gradient(165deg, #2a1d34, #120e16)`,
      }}
    >
      {cover && (
        // eslint-disable-next-line @next/next/no-img-element -- a stored cover, decorative and blurred
        <img src={cover} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-45 blur-[3px] scale-110" />
      )}
      <span aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/65" />
      <span className="absolute left-[4.5cqw] top-[4.5cqw] rounded-full bg-white/15 backdrop-blur-sm px-[3cqw] py-[1.2cqw] text-[3.6cqw] font-semibold">Not posted yet</span>

      <div className="absolute inset-x-[6cqw] top-[14%] bottom-[50%] flex items-center justify-center text-center">
        <p className="heading m-0 leading-[1.35]" style={{ fontSize: `${scale * 100}cqw` }}>
          <span className="box-decoration-clone rounded-[1.4cqw] bg-[#f7f5f8] text-[#1d1724] px-[2cqw] py-[0.5cqw] shadow-[0_0.6cqw_0_rgba(0,0,0,0.25)]">{data.hook}</span>
        </p>
      </div>

      <Rail handle={data.handle} locked={locked} />

      <figcaption className={`absolute left-[4.5cqw] right-[18cqw] bottom-[5cqw] grid gap-[1.6cqw] text-[3.9cqw] leading-[1.35] ${locked ? "blur-[1.2cqw] opacity-70" : ""}`}>
        <span className="font-bold text-[4.3cqw]">@{data.handle}</span>
        {locked ? (
          <span aria-hidden className="grid gap-[1.6cqw]">
            <span className="h-[3.2cqw] rounded-full bg-on-night/40 w-[92%]" />
            <span className="h-[3.2cqw] rounded-full bg-on-night/40 w-[70%]" />
            <span className="h-[3.2cqw] rounded-full bg-on-night/40 w-[55%]" />
          </span>
        ) : (
          <>
            <span className="line-clamp-3">
              {data.caption}{" "}
              {data.hashtags?.map((h) => (
                <span key={h} className="frame-tag mono font-medium">
                  {h}{" "}
                </span>
              ))}
            </span>
            <span className="flex items-center gap-[1.6cqw] min-w-0">
              <Note />
              <span className="truncate">{data.sound}</span>
            </span>
          </>
        )}
      </figcaption>
    </figure>
  );
}
