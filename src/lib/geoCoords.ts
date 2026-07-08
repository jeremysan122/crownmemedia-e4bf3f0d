// Curated lat/lng centers for countries, US states, Canadian provinces,
// and major world cities. Centroids sourced from public-domain geo data
// (Natural Earth / Wikipedia). Name matching is case-insensitive with
// punctuation-tolerant normalization and common alias / abbreviation
// expansion (e.g. "U.S." → United States, "AB" → Alberta, "WI" → Wisconsin).

export type LatLng = [number, number];

/* ------------------------- Normalization ------------------------- */

function norm(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\./g, "")       // "U.S." → "us"
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ");
}

// Country alias table (normalized keys → canonical country key).
const COUNTRY_ALIASES: Record<string, string> = {
  "usa": "united states",
  "us": "united states",
  "u s a": "united states",
  "united states of america": "united states",
  "america": "united states",
  "uk": "united kingdom",
  "u k": "united kingdom",
  "great britain": "united kingdom",
  "gb": "united kingdom",
  "uae": "united arab emirates",
  "u a e": "united arab emirates",
  "ca": "canada",   // country context only
  "can": "canada",
  "mex": "mexico",
  "prc": "china",
  "roc": "taiwan",
  "kor": "south korea",
  "korea": "south korea",
  "russia federation": "russia",
};

// US state 2-letter abbreviations → canonical state key.
const STATE_ABBR: Record<string, string> = {
  al: "alabama", ak: "alaska", az: "arizona", ar: "arkansas", ca: "california",
  co: "colorado", ct: "connecticut", de: "delaware", fl: "florida", ga: "georgia",
  hi: "hawaii", id: "idaho", il: "illinois", in: "indiana", ia: "iowa",
  ks: "kansas", ky: "kentucky", la: "louisiana", me: "maine", md: "maryland",
  ma: "massachusetts", mi: "michigan", mn: "minnesota", ms: "mississippi",
  mo: "missouri", mt: "montana", ne: "nebraska", nv: "nevada", nh: "new hampshire",
  nj: "new jersey", nm: "new mexico", ny: "new york", nc: "north carolina",
  nd: "north dakota", oh: "ohio", ok: "oklahoma", or: "oregon", pa: "pennsylvania",
  ri: "rhode island", sc: "south carolina", sd: "south dakota", tn: "tennessee",
  tx: "texas", ut: "utah", vt: "vermont", va: "virginia", wa: "washington",
  wv: "west virginia", wi: "wisconsin", wy: "wyoming",
};

// Canadian province 2-letter abbreviations → canonical province key.
const PROVINCE_ABBR: Record<string, string> = {
  ab: "alberta", bc: "british columbia", mb: "manitoba", nb: "new brunswick",
  nl: "newfoundland and labrador", ns: "nova scotia", nt: "northwest territories",
  nu: "nunavut", on: "ontario", pe: "prince edward island", pei: "prince edward island",
  qc: "quebec", sk: "saskatchewan", yt: "yukon",
};

/* ------------------------- Reference data ------------------------- */

const COUNTRIES: Record<string, LatLng> = {
  "afghanistan": [33.93911, 67.709953], "albania": [41.153332, 20.168331],
  "algeria": [28.033886, 1.659626], "andorra": [42.546245, 1.601554],
  "angola": [-11.202692, 17.873887], "argentina": [-38.416097, -63.616672],
  "armenia": [40.069099, 45.038189], "australia": [-25.274398, 133.775136],
  "austria": [47.516231, 14.550072], "azerbaijan": [40.143105, 47.576927],
  "bahamas": [25.03428, -77.39628], "bahrain": [25.930414, 50.637772],
  "bangladesh": [23.684994, 90.356331], "barbados": [13.193887, -59.543198],
  "belarus": [53.709807, 27.953389], "belgium": [50.503887, 4.469936],
  "belize": [17.189877, -88.49765], "benin": [9.30769, 2.315834],
  "bhutan": [27.514162, 90.433601], "bolivia": [-16.290154, -63.588653],
  "bosnia and herzegovina": [43.915886, 17.679076], "botswana": [-22.328474, 24.684866],
  "brazil": [-14.235004, -51.92528], "brunei": [4.535277, 114.727669],
  "bulgaria": [42.733883, 25.48583], "burkina faso": [12.238333, -1.561593],
  "burundi": [-3.373056, 29.918886], "cambodia": [12.565679, 104.990963],
  "cameroon": [7.369722, 12.354722], "canada": [56.130366, -106.346771],
  "cape verde": [16.5388, -23.0418], "central african republic": [6.611111, 20.939444],
  "chad": [15.454166, 18.732207], "chile": [-35.675147, -71.542969],
  "china": [35.86166, 104.195397], "colombia": [4.570868, -74.297333],
  "comoros": [-11.875001, 43.872219], "congo": [-0.228021, 15.827659],
  "costa rica": [9.748917, -83.753428], "croatia": [45.1, 15.2],
  "cuba": [21.521757, -77.781167], "cyprus": [35.126413, 33.429859],
  "czech republic": [49.817492, 15.472962], "czechia": [49.817492, 15.472962],
  "denmark": [56.26392, 9.501785], "djibouti": [11.825138, 42.590275],
  "dominican republic": [18.735693, -70.162651], "ecuador": [-1.831239, -78.183406],
  "egypt": [26.820553, 30.802498], "el salvador": [13.794185, -88.89653],
  "estonia": [58.595272, 25.013607], "ethiopia": [9.145, 40.489673],
  "fiji": [-16.578193, 179.414413], "finland": [61.92411, 25.748151],
  "france": [46.227638, 2.213749], "gabon": [-0.803689, 11.609444],
  "gambia": [13.443182, -15.310139], "georgia": [42.315407, 43.356892],
  "germany": [51.165691, 10.451526], "ghana": [7.946527, -1.023194],
  "greece": [39.074208, 21.824312], "greenland": [71.706936, -42.604303],
  "guatemala": [15.783471, -90.230759], "guinea": [9.945587, -9.696645],
  "guyana": [4.860416, -58.93018], "haiti": [18.971187, -72.285215],
  "honduras": [15.199999, -86.241905], "hong kong": [22.396428, 114.109497],
  "hungary": [47.162494, 19.503304], "iceland": [64.963051, -19.020835],
  "india": [20.593684, 78.96288], "indonesia": [-0.789275, 113.921327],
  "iran": [32.427908, 53.688046], "iraq": [33.223191, 43.679291],
  "ireland": [53.41291, -8.24389], "israel": [31.046051, 34.851612],
  "italy": [41.87194, 12.56738], "ivory coast": [7.539989, -5.54708],
  "jamaica": [18.109581, -77.297508], "japan": [36.204824, 138.252924],
  "jordan": [30.585164, 36.238414], "kazakhstan": [48.019573, 66.923684],
  "kenya": [-0.023559, 37.906193], "kuwait": [29.31166, 47.481766],
  "kyrgyzstan": [41.20438, 74.766098], "laos": [19.85627, 102.495496],
  "latvia": [56.879635, 24.603189], "lebanon": [33.854721, 35.862285],
  "lesotho": [-29.609988, 28.233608], "liberia": [6.428055, -9.429499],
  "libya": [26.3351, 17.228331], "liechtenstein": [47.166, 9.555373],
  "lithuania": [55.169438, 23.881275], "luxembourg": [49.815273, 6.129583],
  "macau": [22.198745, 113.543873], "madagascar": [-18.766947, 46.869107],
  "malawi": [-13.254308, 34.301525], "malaysia": [4.210484, 101.975766],
  "maldives": [3.202778, 73.22068], "mali": [17.570692, -3.996166],
  "malta": [35.937496, 14.375416], "mauritania": [21.00789, -10.940835],
  "mauritius": [-20.348404, 57.552152], "mexico": [23.634501, -102.552784],
  "moldova": [47.411631, 28.369885], "monaco": [43.750298, 7.412841],
  "mongolia": [46.862496, 103.846656], "montenegro": [42.708678, 19.37439],
  "morocco": [31.791702, -7.09262], "mozambique": [-18.665695, 35.529562],
  "myanmar": [21.913965, 95.956223], "namibia": [-22.95764, 18.49041],
  "nepal": [28.394857, 84.124008], "netherlands": [52.132633, 5.291266],
  "new zealand": [-40.900557, 174.885971], "nicaragua": [12.865416, -85.207229],
  "niger": [17.607789, 8.081666], "nigeria": [9.081999, 8.675277],
  "north korea": [40.339852, 127.510093], "north macedonia": [41.608635, 21.745275],
  "norway": [60.472024, 8.468946], "oman": [21.512583, 55.923255],
  "pakistan": [30.375321, 69.345116], "palestine": [31.952162, 35.233154],
  "panama": [8.537981, -80.782127], "papua new guinea": [-6.314993, 143.95555],
  "paraguay": [-23.442503, -58.443832], "peru": [-9.189967, -75.015152],
  "philippines": [12.879721, 121.774017], "poland": [51.919438, 19.145136],
  "portugal": [39.399872, -8.224454], "puerto rico": [18.220833, -66.590149],
  "qatar": [25.354826, 51.183884], "romania": [45.943161, 24.96676],
  "russia": [61.52401, 105.318756], "rwanda": [-1.940278, 29.873888],
  "saudi arabia": [23.885942, 45.079162], "senegal": [14.497401, -14.452362],
  "serbia": [44.016521, 21.005859], "sierra leone": [8.460555, -11.779889],
  "singapore": [1.352083, 103.819836], "slovakia": [48.669026, 19.699024],
  "slovenia": [46.151241, 14.995463], "somalia": [5.152149, 46.199616],
  "south africa": [-30.559482, 22.937506], "south korea": [35.907757, 127.766922],
  "south sudan": [6.876992, 31.306978], "spain": [40.463667, -3.74922],
  "sri lanka": [7.873054, 80.771797], "sudan": [12.862807, 30.217636],
  "suriname": [3.919305, -56.027783], "sweden": [60.128161, 18.643501],
  "switzerland": [46.818188, 8.227512], "syria": [34.802075, 38.996815],
  "taiwan": [23.69781, 120.960515], "tajikistan": [38.861034, 71.276093],
  "tanzania": [-6.369028, 34.888822], "thailand": [15.870032, 100.992541],
  "togo": [8.619543, 0.824782], "trinidad and tobago": [10.691803, -61.222503],
  "tunisia": [33.886917, 9.537499], "turkey": [38.963745, 35.243322],
  "turkmenistan": [38.969719, 59.556278], "uganda": [1.373333, 32.290275],
  "ukraine": [48.379433, 31.16558], "united arab emirates": [23.424076, 53.847818],
  "united kingdom": [55.378051, -3.435973],
  "england": [52.355518, -1.17432], "scotland": [56.490672, -4.202646],
  "wales": [52.130661, -3.783712], "northern ireland": [54.7877, -6.4923],
  "united states": [37.09024, -95.712891],
  "uruguay": [-32.522779, -55.765835], "uzbekistan": [41.377491, 64.585262],
  "venezuela": [6.42375, -66.58973], "vietnam": [14.058324, 108.277199],
  "yemen": [15.552727, 48.516388], "zambia": [-13.133897, 27.849332],
  "zimbabwe": [-19.015438, 29.154857],
};

const US_STATES: Record<string, LatLng> = {
  "alabama": [32.806671, -86.79113], "alaska": [61.370716, -152.404419],
  "arizona": [33.729759, -111.431221], "arkansas": [34.969704, -92.373123],
  "california": [36.116203, -119.681564], "colorado": [39.059811, -105.311104],
  "connecticut": [41.597782, -72.755371], "delaware": [39.318523, -75.507141],
  "florida": [27.766279, -81.686783], "georgia": [33.040619, -83.643074],
  "hawaii": [21.094318, -157.498337], "idaho": [44.240459, -114.478828],
  "illinois": [40.349457, -88.986137], "indiana": [39.849426, -86.258278],
  "iowa": [42.011539, -93.210526], "kansas": [38.5266, -96.726486],
  "kentucky": [37.66814, -84.670067], "louisiana": [31.169546, -91.867805],
  "maine": [44.693947, -69.381927], "maryland": [39.063946, -76.802101],
  "massachusetts": [42.230171, -71.530106], "michigan": [43.326618, -84.536095],
  "minnesota": [45.694454, -93.900192], "mississippi": [32.741646, -89.678696],
  "missouri": [38.456085, -92.288368], "montana": [46.921925, -110.454353],
  "nebraska": [41.12537, -98.268082], "nevada": [38.313515, -117.055374],
  "new hampshire": [43.452492, -71.563896], "new jersey": [40.298904, -74.521011],
  "new mexico": [34.840515, -106.248482], "new york": [42.165726, -74.948051],
  "north carolina": [35.630066, -79.806419], "north dakota": [47.528912, -99.784012],
  "ohio": [40.388783, -82.764915], "oklahoma": [35.565342, -96.928917],
  "oregon": [44.572021, -122.070938], "pennsylvania": [40.590752, -77.209755],
  "rhode island": [41.680893, -71.51178], "south carolina": [33.856892, -80.945007],
  "south dakota": [44.299782, -99.438828], "tennessee": [35.747845, -86.692345],
  "texas": [31.054487, -97.563461], "utah": [40.150032, -111.862434],
  "vermont": [44.045876, -72.710686], "virginia": [37.769337, -78.169968],
  "washington": [47.400902, -121.490494], "west virginia": [38.491226, -80.954453],
  "wisconsin": [44.268543, -89.616508], "wyoming": [42.755966, -107.30249],
};

const CA_PROVINCES: Record<string, LatLng> = {
  "alberta": [53.9333, -116.5765],
  "british columbia": [53.7267, -127.6476],
  "manitoba": [53.7609, -98.8139],
  "new brunswick": [46.5653, -66.4619],
  "newfoundland and labrador": [53.1355, -57.6604],
  "northwest territories": [64.8255, -124.8457],
  "nova scotia": [44.6820, -63.7443],
  "nunavut": [70.2998, -83.1076],
  "ontario": [51.2538, -85.3232],
  "prince edward island": [46.5107, -63.4168],
  "quebec": [52.9399, -73.5491],
  "saskatchewan": [52.9399, -106.4509],
  "yukon": [64.2823, -135.0000],
};

const CITIES: Record<string, LatLng> = {
  // US
  "new york": [40.712776, -74.005974], "new york city": [40.712776, -74.005974],
  "los angeles": [34.052235, -118.243683], "chicago": [41.878113, -87.629799],
  "houston": [29.760427, -95.369804], "phoenix": [33.448376, -112.074036],
  "philadelphia": [39.952583, -75.165222], "san antonio": [29.424122, -98.493629],
  "san diego": [32.715736, -117.161087], "dallas": [32.776665, -96.796989],
  "san jose": [37.338207, -121.886330], "austin": [30.267153, -97.743057],
  "miami": [25.761681, -80.191788], "atlanta": [33.749001, -84.387978],
  "boston": [42.360081, -71.058884], "seattle": [47.606209, -122.332069],
  "san francisco": [37.774929, -122.419418], "denver": [39.739235, -104.990250],
  "las vegas": [36.169941, -115.139832], "detroit": [42.331429, -83.045753],
  "green bay": [44.5133, -88.0133], "appleton": [44.2619, -88.4154],
  "oshkosh": [44.0247, -88.5426], "milwaukee": [43.0389, -87.9065],
  "madison": [43.0731, -89.4012], "memphis": [35.1495, -90.0490],
  "nashville": [36.1627, -86.7816], "st louis": [38.6270, -90.1994],
  "saint louis": [38.6270, -90.1994], "kansas city": [39.0997, -94.5786],
  "minneapolis": [44.9778, -93.2650], "charlotte": [35.2271, -80.8431],
  "orlando": [28.5383, -81.3792], "tampa": [27.9506, -82.4572],
  "new orleans": [29.9511, -90.0715], "cleveland": [41.4993, -81.6944],
  "columbus": [39.9612, -82.9988], "indianapolis": [39.7684, -86.1581],
  // Canada
  "toronto": [43.65107, -79.347015], "vancouver": [49.282730, -123.120735],
  "montreal": [45.501690, -73.567253], "edmonton": [53.5461, -113.4938],
  "calgary": [51.0447, -114.0719], "ottawa": [45.4215, -75.6972],
  "winnipeg": [49.8951, -97.1384], "quebec city": [46.8139, -71.2080],
  "halifax": [44.6488, -63.5752], "regina": [50.4452, -104.6189],
  "saskatoon": [52.1332, -106.6700],
  // Mexico / LatAm
  "mexico city": [19.432608, -99.133209], "rio de janeiro": [-22.906847, -43.172897],
  "sao paulo": [-23.550520, -46.633308], "buenos aires": [-34.603722, -58.381592],
  "santiago": [-33.448891, -70.669266], "lima": [-12.046374, -77.042793],
  "bogota": [4.710989, -74.072090], "caracas": [10.480594, -66.903603],
  // Europe
  "london": [51.507351, -0.127758], "manchester": [53.480759, -2.242631],
  "paris": [48.856613, 2.352222], "berlin": [52.520008, 13.404954],
  "munich": [48.135124, 11.581981], "madrid": [40.416775, -3.703790],
  "barcelona": [41.385063, 2.173404], "rome": [41.902782, 12.496366],
  "milan": [45.464203, 9.189982], "amsterdam": [52.367573, 4.904139],
  "brussels": [50.850346, 4.351721], "vienna": [48.208176, 16.373819],
  "prague": [50.075539, 14.437800], "warsaw": [52.229675, 21.012230],
  "stockholm": [59.329323, 18.068581], "oslo": [59.913868, 10.752245],
  "copenhagen": [55.676098, 12.568337], "helsinki": [60.169856, 24.938379],
  "dublin": [53.349806, -6.260310], "lisbon": [38.722252, -9.139337],
  "athens": [37.983810, 23.727539], "istanbul": [41.008240, 28.978359],
  "moscow": [55.755825, 37.617298], "saint petersburg": [59.934280, 30.335099],
  "kyiv": [50.450100, 30.523399],
  // MENA / Africa
  "dubai": [25.204849, 55.270782], "abu dhabi": [24.453884, 54.377342],
  "riyadh": [24.713552, 46.675297], "doha": [25.285446, 51.531040],
  "tel aviv": [32.085300, 34.781769], "cairo": [30.044420, 31.235712],
  "lagos": [6.524379, 3.379206], "nairobi": [-1.292066, 36.821945],
  "johannesburg": [-26.204103, 28.047305], "cape town": [-33.924870, 18.424055],
  // Asia
  "mumbai": [19.075983, 72.877655], "delhi": [28.704060, 77.102493],
  "new delhi": [28.613939, 77.209023], "bengaluru": [12.971599, 77.594566],
  "bangalore": [12.971599, 77.594566], "kolkata": [22.572645, 88.363892],
  "chennai": [13.082680, 80.270721], "karachi": [24.860735, 67.001137],
  "lahore": [31.520369, 74.358749], "dhaka": [23.810331, 90.412521],
  "bangkok": [13.756331, 100.501762], "kuala lumpur": [3.139003, 101.686852],
  "singapore": [1.352083, 103.819836], "jakarta": [-6.208763, 106.845599],
  "manila": [14.599512, 120.984222], "hong kong": [22.396428, 114.109497],
  "taipei": [25.032969, 121.565418], "shanghai": [31.230391, 121.473701],
  "beijing": [39.904202, 116.407394], "shenzhen": [22.543096, 114.057861],
  "guangzhou": [23.129110, 113.264381], "tokyo": [35.689487, 139.691711],
  "osaka": [34.693737, 135.502167], "kyoto": [35.011665, 135.768326],
  "seoul": [37.566536, 126.977966],
  // Oceania
  "sydney": [-33.868820, 151.209290], "melbourne": [-37.813629, 144.963058],
  "brisbane": [-27.469770, 153.025131], "perth": [-31.950527, 115.860458],
  "auckland": [-36.848461, 174.763336], "wellington": [-41.286461, 174.776230],
};

/* --------------------------- Lookup --------------------------- */

/**
 * Resolve a region name to a public center coordinate.
 * Returns `null` when the name is not in our curated lookup — callers MUST
 * treat that as "unmapped" and NOT invent a fake pin position.
 *
 * Handles:
 *   - case-insensitive matching
 *   - punctuation ("U.S." → us) & extra whitespace
 *   - country aliases (USA, U.S.A., United States of America, UK, UAE, ...)
 *   - state abbreviations (WI → Wisconsin, TN → Tennessee)
 *   - province abbreviations (AB → Alberta, BC → British Columbia)
 *   - "CA" is Canada when `type === "country"`, California when
 *     `type === "state"` — never conflated across scopes.
 */
export function lookupGeo(
  name: string,
  type: "country" | "state" | "city" | "global",
): LatLng | null {
  if (!name) return null;
  const k = norm(name);

  if (type === "country") {
    const canon = COUNTRY_ALIASES[k] ?? k;
    return COUNTRIES[canon] ?? null;
  }
  if (type === "state") {
    // Try US state abbrev first, then province abbrev, then full names.
    const usKey = STATE_ABBR[k] ?? k;
    if (US_STATES[usKey]) return US_STATES[usKey];
    const caKey = PROVINCE_ABBR[k] ?? k;
    if (CA_PROVINCES[caKey]) return CA_PROVINCES[caKey];
    return null;
  }
  if (type === "city") {
    return CITIES[k] ?? null;
  }
  return null;
}

/**
 * Resolve a crowned POST to a public map coordinate.
 *
 * Priority (matches refresh_crown_map_points on the server so pins and cache
 * always agree):
 *   1. Exact post coords — ONLY when the user explicitly consented via
 *      `location_enabled = true` AND `location_source = 'current_location'`.
 *   2. Safe city center resolved from `posts.city`.
 *   3. Safe region center resolved from the crown's `region_name` +
 *      `region_type` (state / country fallback).
 *   4. Safe state, then safe country center from `posts.state` / `posts.country`.
 *
 * Returns `{ coord: null }` when nothing matches. Callers MUST treat that as
 * "unmapped" and hide the marker — never invent a coordinate. Profile / device /
 * home location is intentionally never consulted here.
 */
export function lookupPostGeo(input: {
  post_lat?: number | null;
  post_lng?: number | null;
  location_enabled?: boolean | null;
  location_source?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  region_type?: "country" | "state" | "city" | "global" | null;
  region_name?: string | null;
}): { coord: LatLng | null; precision: "exact" | "city" | "state" | "country" | "none" } {
  if (
    input.location_enabled === true &&
    input.location_source === "current_location" &&
    typeof input.post_lat === "number" &&
    typeof input.post_lng === "number" &&
    Number.isFinite(input.post_lat) &&
    Number.isFinite(input.post_lng)
  ) {
    return { coord: [input.post_lat, input.post_lng], precision: "exact" };
  }
  if (input.city && input.city.trim()) {
    const c = lookupGeo(input.city, "city");
    if (c) return { coord: c, precision: "city" };
  }
  if (input.region_name && input.region_type && input.region_type !== "global") {
    const r = lookupGeo(input.region_name, input.region_type);
    if (r) {
      return {
        coord: r,
        precision: input.region_type === "country" ? "country" : "state",
      };
    }
  }
  if (input.state && input.state.trim()) {
    const s = lookupGeo(input.state, "state");
    if (s) return { coord: s, precision: "state" };
  }
  if (input.country && input.country.trim()) {
    const c = lookupGeo(input.country, "country");
    if (c) return { coord: c, precision: "country" };
  }
  return { coord: null, precision: "none" };
}

/**
 * Deterministic decorative fallback — DO NOT use for visible map pins.
 * Retained only for tests and legacy hashing fixtures.
 */
export function fallbackCoord(name: string): LatLng {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u1 = ((h >>> 0) % 10000) / 10000;
  const u2 = (((h >>> 13) >>> 0) % 10000) / 10000;
  const lat = u1 * 110 - 50;
  const lon = u2 * 340 - 170;
  return [lat, lon];
}

