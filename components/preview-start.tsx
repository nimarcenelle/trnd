import { IconArrowRight } from "@/components/icons";

/** The website box that starts a free report. A plain POST to /api/preview, which redirects to the report. */
export default function PreviewStart({ cta = "Get free report", site }: { cta?: string; site?: string }) {
  return (
    <form action="/api/preview" method="post" className="sitebox w-full max-w-[460px]">
      <input name="site" placeholder="yourbrand.com" aria-label="Your website" autoComplete="url" defaultValue={site} required />
      <button className="btn btn-primary" type="submit">
        {cta} <IconArrowRight />
      </button>
    </form>
  );
}
