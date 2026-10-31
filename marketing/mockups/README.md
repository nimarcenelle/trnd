# TikTok test mockups

Five 10-second, sound-off TikToks to find which idea pulls "what's the app?" comments. Each file is a standalone
1080×1920 (9:16) page that loops every 10 seconds. No build step: open it in Chrome.

| File | The idea in one line |
| --- | --- |
| `next-tiktok.html` | A finished-looking TikTok that isn't posted yet, then the record screen with its hook as the teleprompter: the app wrote it, I just film it. |
| `xray.html` | My niche's videos go grey, a scan line sweeps down, and the one that beat its creator's usual lifts out at 7.3×. |
| `next-level.html` | Me (73 followers) slides into an account in my niche with 25K, and their three videos that beat their usual drop in. |
| `self-writing.html` | An upload screen fills itself in: caption, hashtags, and when to post. |
| `stamp.html` | The posted video, a 48-hour clock spins, then "Beat 3.4×" stamps onto it. |

The TRND name is left out on purpose: the test is whether people ask. Every account is invented (`＠marlow.studies`,
`＠fenn.explains`, `＠oli.draws`, `＠juno.draws`), and there are no predicted views or follower counts.

## Controls

- **R** restarts the loop from 0s. Press it right after you start recording.
- **Space** pauses and resumes.
- `?t=4` at the end of the URL freezes on 4 seconds in, for a cover image (`stamp.html?t=8`).

The page scales the 1080×1920 frame to fit any window, so it always stays 9:16.

## Recording at 9:16 on a Mac

### Chrome device mode (exact 1080×1920, recommended)

1. Open the file in Chrome (drag it onto a Chrome window).
2. Open DevTools (⌘⌥I), then the device toolbar (⌘⇧M).
3. In the device menu choose **Edit… → Add custom device**: name it `TikTok 9:16`, width **540**, height **960**,
   device pixel ratio **2**. Pick it, and set zoom to 100%.
   On a Retina screen 540×960 at 2× is exactly 1080×1920 pixels.
4. Press ⌘⇧5, choose **Record Selected Portion**, and drag the box tightly around the 540×960 frame.
5. Click **Record**, click into the page, press **R**, and let it run about 12 seconds. Stop with the ⏹ in the menu bar.
6. Open the recording in QuickTime, **Edit → Trim** (⌘T) to one 10-second loop starting at the restart, and save.

### QuickTime only (quick, slightly less exact)

1. Open the file in Chrome and make the window tall: the page letterboxes itself to 9:16.
2. QuickTime Player → **File → New Screen Recording** (or ⌘⇧5) → **Record Selected Portion**, and drag around the frame.
3. Record, press **R**, stop after about 12 seconds, then trim to 10 seconds with ⌘T.

TikTok accepts a frame that isn't exactly 1080×1920 but will add bars if the ratio is off, so keep the box tight.

## Before posting

- Keep the post silent or add a quiet sound; nothing in the mockups depends on audio.
- TikTok covers about the bottom 420px (caption, handle) and the right 140px (buttons) of the frame. The moment that
  matters in each mockup sits above that line; the lower edges (the bottom grid row, the Post button) may end up under
  the caption, which is fine. Don't add your own text there.
- Don't add the TikTok logo or icons; these are generic on purpose.
