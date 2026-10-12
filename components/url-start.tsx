/** The site-address box that starts everything. Plain GET to /signup, no JS needed. */
export default function UrlStart({ cta = "Watch my rivals" }: { cta?: string }) {
  return (
    <form action="/signup" method="get" className="urlbox w-full max-w-[560px]">
      <span className="prefix hidden sm:flex">https://</span>
      <input className="pl-3 sm:pl-1" name="site" placeholder="yourbrand.com" aria-label="Your website" autoComplete="url" required />
      <button className="btn btn-primary" type="submit">
        {cta} <span aria-hidden>→</span>
      </button>
    </form>
  );
}
