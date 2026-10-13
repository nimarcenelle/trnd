import { IconArrowRight } from "@/components/icons";

/** The website box that starts a trial. A plain GET to /signup. */
export default function UrlStart({ cta = "Get started" }: { cta?: string }) {
  return (
    <form action="/signup" method="get" className="sitebox w-full max-w-[460px]">
      <input name="site" placeholder="yourbrand.com" aria-label="Your website" autoComplete="url" required />
      <button className="btn btn-primary" type="submit">
        {cta} <IconArrowRight />
      </button>
    </form>
  );
}
