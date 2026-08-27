/**
 * Local means local: city → metro (Nielsen DMA) resolution so signal is
 * measured where the business's customers actually are, not nationally.
 *
 * Google Trends accepts DMA-level geos ("US-GA-524" = Atlanta metro) — one
 * level of real, free, sub-state demand measurement almost nobody uses.
 * Coordinates feed the weather adapter. Top ~50 US metros cover the large
 * majority of US SMBs; everywhere else degrades to state-level, which is
 * still better than the national noise this table replaces.
 */

export interface Metro {
  /** Google Trends geo string, e.g. "US-GA-524". */
  geo: string;
  name: string;
  state: string;
  lat: number;
  lng: number;
}

const M = (state: string, dma: number, name: string, lat: number, lng: number): Metro => ({
  geo: `US-${state}-${dma}`,
  name,
  state,
  lat,
  lng,
});

/** Keyed by lowercase city name. Aliases map suburbs to their metro. */
const METROS: Record<string, Metro> = {
  "new york": M("NY", 501, "New York metro", 40.71, -74.01),
  "los angeles": M("CA", 803, "Los Angeles metro", 34.05, -118.24),
  chicago: M("IL", 602, "Chicago metro", 41.88, -87.63),
  philadelphia: M("PA", 504, "Philadelphia metro", 39.95, -75.17),
  dallas: M("TX", 623, "Dallas–Fort Worth metro", 32.78, -96.8),
  "san francisco": M("CA", 807, "SF Bay Area", 37.77, -122.42),
  washington: M("DC", 511, "Washington DC metro", 38.91, -77.04),
  houston: M("TX", 618, "Houston metro", 29.76, -95.37),
  boston: M("MA", 506, "Boston metro", 42.36, -71.06),
  atlanta: M("GA", 524, "Atlanta metro", 33.75, -84.39),
  phoenix: M("AZ", 753, "Phoenix metro", 33.45, -112.07),
  seattle: M("WA", 819, "Seattle–Tacoma metro", 47.61, -122.33),
  detroit: M("MI", 505, "Detroit metro", 42.33, -83.05),
  minneapolis: M("MN", 613, "Minneapolis–St. Paul metro", 44.98, -93.27),
  miami: M("FL", 528, "Miami–Fort Lauderdale metro", 25.76, -80.19),
  denver: M("CO", 751, "Denver metro", 39.74, -104.99),
  orlando: M("FL", 534, "Orlando metro", 28.54, -81.38),
  tampa: M("FL", 539, "Tampa–St. Pete metro", 27.95, -82.46),
  charlotte: M("NC", 517, "Charlotte metro", 35.23, -80.84),
  "st. louis": M("MO", 609, "St. Louis metro", 38.63, -90.2),
  "saint louis": M("MO", 609, "St. Louis metro", 38.63, -90.2),
  pittsburgh: M("PA", 508, "Pittsburgh metro", 40.44, -80.0),
  baltimore: M("MD", 512, "Baltimore metro", 39.29, -76.61),
  sacramento: M("CA", 862, "Sacramento metro", 38.58, -121.49),
  "san diego": M("CA", 825, "San Diego metro", 32.72, -117.16),
  austin: M("TX", 635, "Austin metro", 30.27, -97.74),
  "san antonio": M("TX", 641, "San Antonio metro", 29.42, -98.49),
  nashville: M("TN", 659, "Nashville metro", 36.16, -86.78),
  indianapolis: M("IN", 527, "Indianapolis metro", 39.77, -86.16),
  columbus: M("OH", 535, "Columbus metro", 39.96, -83.0),
  "kansas city": M("MO", 616, "Kansas City metro", 39.1, -94.58),
  "las vegas": M("NV", 839, "Las Vegas metro", 36.17, -115.14),
  cleveland: M("OH", 510, "Cleveland metro", 41.5, -81.69),
  cincinnati: M("OH", 515, "Cincinnati metro", 39.1, -84.51),
  milwaukee: M("WI", 617, "Milwaukee metro", 43.04, -87.91),
  raleigh: M("NC", 560, "Raleigh–Durham metro", 35.78, -78.64),
  durham: M("NC", 560, "Raleigh–Durham metro", 35.99, -78.9),
  portland: M("OR", 820, "Portland metro", 45.52, -122.68),
  "salt lake city": M("UT", 770, "Salt Lake City metro", 40.76, -111.89),
  jacksonville: M("FL", 561, "Jacksonville metro", 30.33, -81.66),
  "new orleans": M("LA", 622, "New Orleans metro", 29.95, -90.07),
  memphis: M("TN", 640, "Memphis metro", 35.15, -90.05),
  birmingham: M("AL", 630, "Birmingham metro", 33.52, -86.8),
  norfolk: M("VA", 544, "Norfolk metro", 36.85, -76.29),
  buffalo: M("NY", 514, "Buffalo metro", 42.89, -78.88),
  providence: M("RI", 521, "Providence metro", 41.82, -71.41),
  hartford: M("CT", 533, "Hartford–New Haven metro", 41.77, -72.67),
  richmond: M("VA", 556, "Richmond metro", 37.54, -77.44),
  louisville: M("KY", 529, "Louisville metro", 38.25, -85.76),
  "oklahoma city": M("OK", 650, "Oklahoma City metro", 35.47, -97.52),
  tulsa: M("OK", 671, "Tulsa metro", 36.15, -95.99),
  albuquerque: M("NM", 790, "Albuquerque metro", 35.08, -106.65),
  fresno: M("CA", 866, "Fresno metro", 36.74, -119.79),
  greensboro: M("NC", 518, "Greensboro metro", 36.07, -79.79),
  greenville: M("SC", 567, "Greenville–Spartanburg metro", 34.85, -82.4),
  // suburb → metro aliases
  brooklyn: M("NY", 501, "New York metro", 40.68, -73.94),
  queens: M("NY", 501, "New York metro", 40.73, -73.79),
  "fort worth": M("TX", 623, "Dallas–Fort Worth metro", 32.76, -97.33),
  plano: M("TX", 623, "Dallas–Fort Worth metro", 33.02, -96.7),
  arlington: M("TX", 623, "Dallas–Fort Worth metro", 32.74, -97.11),
  oakland: M("CA", 807, "SF Bay Area", 37.8, -122.27),
  "san jose": M("CA", 807, "SF Bay Area", 37.34, -121.89),
  berkeley: M("CA", 807, "SF Bay Area", 37.87, -122.27),
  "long beach": M("CA", 803, "Los Angeles metro", 33.77, -118.19),
  "santa monica": M("CA", 803, "Los Angeles metro", 34.02, -118.49),
  pasadena: M("CA", 803, "Los Angeles metro", 34.15, -118.14),
  scottsdale: M("AZ", 753, "Phoenix metro", 33.49, -111.93),
  mesa: M("AZ", 753, "Phoenix metro", 33.42, -111.83),
  tempe: M("AZ", 753, "Phoenix metro", 33.43, -111.94),
  tacoma: M("WA", 819, "Seattle–Tacoma metro", 47.25, -122.44),
  bellevue: M("WA", 819, "Seattle–Tacoma metro", 47.61, -122.2),
  aurora: M("CO", 751, "Denver metro", 39.73, -104.83),
  boulder: M("CO", 751, "Denver metro", 40.01, -105.27),
  "st. petersburg": M("FL", 539, "Tampa–St. Pete metro", 27.77, -82.64),
  "miami beach": M("FL", 528, "Miami–Fort Lauderdale metro", 25.79, -80.13),
  "fort lauderdale": M("FL", 528, "Miami–Fort Lauderdale metro", 26.12, -80.14),
  decatur: M("GA", 524, "Atlanta metro", 33.77, -84.3),
  marietta: M("GA", 524, "Atlanta metro", 33.95, -84.55),
  cambridge: M("MA", 506, "Boston metro", 42.37, -71.11),
  evanston: M("IL", 602, "Chicago metro", 42.05, -87.68),
};

/** City (+state to disambiguate) → metro, or null when unmapped. */
export function resolveMetro(city: string, region: string | null): Metro | null {
  const key = city.trim().toLowerCase();
  const hit = METROS[key];
  if (!hit) return null;
  // A state mismatch means a different town with the same name (Portland ME,
  // Columbus GA) — state-level truth beats wrong-metro confidence.
  if (region && hit.state.toUpperCase() !== region.trim().toUpperCase()) return null;
  return hit;
}

export type GeoLevel = "metro" | "state" | "national";

export function geoLevel(geo: string): GeoLevel {
  if (/^US-[A-Z]{2}-\d+$/.test(geo)) return "metro";
  if (/^US-[A-Z]{2}$/.test(geo)) return "state";
  return "national";
}

/**
 * How local a signal is FOR a given business: metro only counts when the
 * metro sits in the business's state (the repo query guarantees this, but
 * scoring shouldn't trust the caller).
 */
export function localityFor(signalGeo: string, businessRegion: string | null): GeoLevel {
  if (!businessRegion) return "national";
  const stateGeo = `US-${businessRegion.trim().toUpperCase()}`;
  if (signalGeo === stateGeo) return "state";
  if (signalGeo.startsWith(`${stateGeo}-`) && geoLevel(signalGeo) === "metro") return "metro";
  return "national";
}

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "Washington DC", FL: "Florida",
  GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana",
  IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine",
  MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

/** "US-GA-524" → "Atlanta metro"; "US-GA" → "Georgia"; "US" → "United States". */
export function geoLabel(geo: string): string {
  if (geoLevel(geo) === "metro") {
    const metro = Object.values(METROS).find((m) => m.geo === geo);
    if (metro) return metro.name;
    const state = STATE_NAMES[geo.slice(3, 5)];
    return state ? `${state} metro area` : geo;
  }
  if (geoLevel(geo) === "state") return STATE_NAMES[geo.slice(3)] ?? geo;
  return "United States";
}
