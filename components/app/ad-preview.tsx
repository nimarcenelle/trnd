/**
 * How the finished ad reads in-feed. Deliberately rendered on light "paper"
 * in both themes — it previews a Meta placement, not the TRND UI.
 */
import { sentenceCase } from "@/lib/text";

export default function AdPreview({
  businessName,
  primaryText,
  headline,
  mediaLine,
  imageUrl,
  cta = "Book now",
}: {
  businessName: string;
  primaryText: string;
  headline: string;
  mediaLine: string;
  /** A real photo from the business's own site, when the import found one. */
  imageUrl?: string | null;
  cta?: string;
}) {
  const initial = businessName.trim().charAt(0).toUpperCase() || "T";
  const truncated = primaryText.length > 150 ? `${primaryText.slice(0, 147)}…` : primaryText;
  // The overlay is read at thumb speed over a photo. A long offer landed
  // here as a full paragraph of white text across the image; clamp it so a
  // verbose generation degrades to a short line rather than wallpaper.
  const overlay = mediaLine.length > 48 ? `${mediaLine.slice(0, 45).trimEnd()}…` : mediaLine;
  // The card that holds it names it; no caption underneath.
  return (
    <div className="ad-preview">
      <div className="ad-preview__top">
        <span className="ad-preview__avatar">{initial}</span>
        <span>
          <span className="ad-preview__name">{sentenceCase(businessName)}</span>
          <br />
          <span className="ad-preview__sponsored">Sponsored</span>
        </span>
      </div>
      <p className="ad-preview__text">{truncated}</p>
      <div
        className="ad-preview__media"
        style={
          imageUrl
            ? {
                backgroundImage: `linear-gradient(rgba(0,0,0,0.05), rgba(0,0,0,0.45)), url(${JSON.stringify(imageUrl)})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                color: "#fff",
                textShadow: "0 1px 6px rgba(0,0,0,0.6)",
              }
            : undefined
        }
      >
        {overlay}
      </div>
      <div className="ad-preview__bottom">
        <span className="ad-preview__headline">{headline}</span>
        <span className="ad-preview__cta">{cta}</span>
      </div>
    </div>
  );
}
