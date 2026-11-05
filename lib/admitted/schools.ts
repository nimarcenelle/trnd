/**
 * Published first-year figures, from each school's own Common Data Set. Sections C1, C9,
 * C14 and C21–C22. A null means the figure could not be read from the file, never a guess.
 * Princeton, Brown, MIT and Johns Hopkins are listed as pending until their files are in.
 */
export type School = {
  id: string;
  name: string;
  aliases: string[];
  edition: string;
  source: string;
  applicants: number;
  admitted: number;
  early: { plan: "ED" | "REA" | "EA"; closes: string | null; applicants: number | null; admitted: number | null };
  sat: string;
  /** Composite 25th and 75th percentile. Summed from the sections where no composite is published. */
  sat25: number;
  sat75: number;
  regularDeadline: string | null;
  note?: string;
};

export const SCHOOLS: School[] = [
  { id: "harvard", name: "Harvard University", aliases: ["harvard", "harvard college"], edition: "2025–26", source: "https://bpb-us-e1.wpmucdn.com/sites.harvard.edu/dist/6/210/files/2026/07/CDS_2025-2026.pdf", applicants: 47893, admitted: 2003, early: { plan: "REA", closes: "Nov 1", applicants: null, admitted: null }, sat: "ERW 720–770, Math 730–790", sat25: 1450, sat75: 1560, regularDeadline: "Jan 1" },
  { id: "yale", name: "Yale University", aliases: ["yale"], edition: "2025–26", source: "https://oir.yale.edu/sites/default/files/yale_cds_2025-26_md_20260616.pdf", applicants: 50264, admitted: 2387, early: { plan: "REA", closes: "Nov 1", applicants: null, admitted: null }, sat: "1480–1560", sat25: 1480, sat75: 1560, regularDeadline: "Jan 2" },
  { id: "dartmouth", name: "Dartmouth College", aliases: ["dartmouth"], edition: "2025–26", source: "https://www.dartmouth.edu/oir/pdfs/cds_2025-26.pdf", applicants: 28230, admitted: 1699, early: { plan: "ED", closes: "Nov 1", applicants: 3552, admitted: 768 }, sat: "1440–1550", sat25: 1440, sat75: 1550, regularDeadline: "Jan 3" },
  { id: "cornell", name: "Cornell University", aliases: ["cornell"], edition: "2025–26", source: "https://irp.cornell.edu/wp-content/uploads/2026/09/Cornell-Common-Data-Set-2025-26.pdf", applicants: 72523, admitted: 6077, early: { plan: "ED", closes: "Nov 1", applicants: 10057, admitted: 1889 }, sat: "1490–1550", sat25: 1490, sat75: 1550, regularDeadline: "Jan 2" },
  { id: "columbia", name: "Columbia University", aliases: ["columbia", "columbia college", "columbia engineering"], edition: "2025–26", source: "https://opir.columbia.edu/cds", applicants: 59611, admitted: 2946, early: { plan: "ED", closes: "Nov 1", applicants: 5868, admitted: 819 }, sat: "1510–1560", sat25: 1510, sat75: 1560, regularDeadline: "Jan 1", note: "Columbia College and Columbia Engineering" },
  { id: "penn", name: "University of Pennsylvania", aliases: ["penn", "upenn", "university of pennsylvania"], edition: "2025–26", source: "https://ira.upenn.edu/penn-numbers/common-data-set", applicants: 72544, admitted: 3570, early: { plan: "ED", closes: "Nov 1", applicants: 9503, admitted: 1266 }, sat: "ERW 740–770, Math 770–800", sat25: 1510, sat75: 1570, regularDeadline: "Jan 5" },
  { id: "stanford", name: "Stanford University", aliases: ["stanford"], edition: "2025–26", source: "https://irds.stanford.edu/data-findings/cds", applicants: 60646, admitted: 2302, early: { plan: "REA", closes: "Nov 1", applicants: null, admitted: null }, sat: "1520–1570", sat25: 1520, sat75: 1570, regularDeadline: "Jan 5" },
  { id: "duke", name: "Duke University", aliases: ["duke"], edition: "2025–26", source: "https://ir.provost.duke.edu/sites/default/files/CDS_PDF_2025-2026-20260622-website-published-version.pdf", applicants: 55541, admitted: 2910, early: { plan: "ED", closes: "Nov 1", applicants: null, admitted: null }, sat: "1510–1570", sat25: 1510, sat75: 1570, regularDeadline: "Jan 2" },
  { id: "uchicago", name: "University of Chicago", aliases: ["uchicago", "chicago", "university of chicago", "u chicago"], edition: "2025–26", source: "https://data.uchicago.edu/files/2026/08/CDS_2025-2026_to_publish-1.pdf", applicants: 45533, admitted: 2039, early: { plan: "ED", closes: null, applicants: null, admitted: null }, sat: "1500–1560", sat25: 1500, sat75: 1560, regularDeadline: null },
  { id: "northwestern", name: "Northwestern University", aliases: ["northwestern"], edition: "2025–26", source: "https://www.enrollment.northwestern.edu/data/2025-2026.pdf", applicants: 52676, admitted: 3933, early: { plan: "ED", closes: "Nov 1", applicants: 5939, admitted: 1212 }, sat: "1520–1560", sat25: 1520, sat75: 1560, regularDeadline: "Jan 1" },
];

export const PENDING_SCHOOLS: { name: string; aliases: string[] }[] = [
  { name: "Princeton University", aliases: ["princeton"] },
  { name: "Brown University", aliases: ["brown"] },
  { name: "MIT", aliases: ["mit", "massachusetts institute of technology"] },
  { name: "Johns Hopkins University", aliases: ["johns hopkins", "hopkins", "jhu"] },
];

export const admitRate = (s: School) => (s.admitted / s.applicants) * 100;
export const earlyRate = (s: School) => (s.early.applicants && s.early.admitted ? (s.early.admitted / s.early.applicants) * 100 : null);
