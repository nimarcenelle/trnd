"use client";

/** The report's export path: the browser's print dialog doubles as save-to-PDF. */
export default function PrintButton() {
  return (
    <button type="button" className="btn btn-ghost btn-sm no-print" onClick={() => window.print()}>
      Print / save PDF
    </button>
  );
}
