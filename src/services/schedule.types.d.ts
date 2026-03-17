// Type definitions for the schedule tile JSON produced by JsonEncoder.encodeTimetablesAsJson.
// One file per OSM feature / OMIM id: { routes, periods, timetables }

// ---------------------------------------------------------------------------
// Top-level tile
// ---------------------------------------------------------------------------

export interface Schedule {
  feed: string;
  /** List of unique stop names referenced by StopOnRoutePosition. */
  snames: string[];
  /** List of unique stop IDs referenced by StopOnRoutePosition. */
  sids: string[];
  /** Deduplicated route descriptors referenced by routeStopTimes entries. */
  routes: Route[];
  periods: Periods;
  /** One entry per GTFS Stop matched with OSM entry or OMIM entry. */
  timetables: StopTimetable[];
}

export interface Periods {
  /**
   * Identifies the bit-level encoding of each period's payload (before compression).
   *
   * "bits" — all periods share the same date window; begin/end are hoisted to the
   *   top-level begin and end properties. Each data entry (after decompression) is
   *   just the raw bit-vector bytes with no header:
   *     bytes [0+] — bit-vector, LSB-first; bit N = service on (begin + N days)
   *
   * "begin:end:bits" — each data entry embeds its own range header:
   *   bytes [0..1] — begin date as uint16 big-endian (days since 2000-01-01)
   *   bytes [2..3] — end   date as uint16 big-endian (days since 2000-01-01)
   *   bytes [4+]   — bit-vector, LSB-first; bit N = service on (begin + N days)
   */
  encoding: "bits" | "begin:end:bits" | string;

  /**
   * Shared begin date (days since 2000-01-01). Present only when encoding is "bits".
   */
  begin?: number;
  /**
   * Shared end date (days since 2000-01-01). Present only when encoding is "bits".
   */
  end?: number;

  /**
   * Compression applied to the encoded bit data before Base64 encoding.
   *
   * "none" — data is an array of raw Base64-URL bits strings, one per period.
   *
   * "rle" — per-period RLE on the Base64-URL characters of the bits string.
   *   data is an array; each entry is Base64-URL of the RLE bytes:
   *     [uint8 char][varint count]…   — runs of identical ASCII chars
   *
   * "transpose_rle" — Approach B: align all periods to a union date range, sort rows
   *   lexicographically, then encode each column as its zero-count. data is a single
   *   Base64-URL string. Used when all periods share the same begin/end and
   *   count > 5; encoding is "bits" (begin/end hoisted to top level) in this case.
   *   Binary layout: [uint16 n][uint16 globalBegin][uint16 globalEnd]
   *                  [n×uint16 begin][n×uint16 end][span×uint16 zeros]
   */
  compression: "none" | "rle" | "transpose_rle" | string;

  /**
   * "none" / "rle": Period[] — one Base64-URL string per period.
   * "transpose_rle": string  — single Base64-URL string for all periods.
   */
  data: Period[] | string;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export type RouteType =
  | "Tram" | "Subway" | "Railway" | "Bus" | "Ferry"
  | "CableTram" | "Aerial" | "Funicular" | "Trolleybus" | "Monorail";

export interface Route {
  /** Pass through from GTFS */
  routeId: string;

  /** Pass through from GTFS */
  shortName: string;

  /** Absent when null. Pass through from GTFS */
  longName?: string;

  /** Absent when null. */
  routeType?: RouteType;

  /** Raw numeric GTFS route_type string. Absent when null. */
  typeRaw?: string;

  /** Pass through from GTFS, IANA timezone identifier, e.g. "Europe/Paris". */
  timezone: string;

  /** Pass through from GTFS, Absent when null. */
  agency?: string;
}

// ---------------------------------------------------------------------------
// Period  (service calendar)
// ---------------------------------------------------------------------------

/**
 * Service calendar, referenced by index from PeriodSection.period.
 * No id field — identity is the position in the periods array.
 */
/**
 * Base64-URL (no padding) encoded binary blob. Absent when no date range
 * can be derived (rare — only for completely empty calendars).
 *
 * Binary layout:
 *   bytes [0..1] — begin date as uint16 big-endian (days since 2000-01-01)
 *   bytes [2..3] — end   date as uint16 big-endian (days since 2000-01-01)
 *   bytes [4+]   — bit-vector, one bit per day in [begin, end], LSB-first;
 *                  bit N is set iff service operates on (begin + N days)
 */
export type Period = string;

// ---------------------------------------------------------------------------
// Stop timetable
// ---------------------------------------------------------------------------

export interface StopTimetable {
  stop: Stop;
  /**
   * Service-calendar sections for this stop.
   * Each entry corresponds to one GTFS service_id / Period.
   */
  periods: PeriodSection[];
}

export interface Stop {
  /** Pass through from GTFS */
  id: string;

  /** Pass through from GTFS */
  stop_name: string;
  
  /** [latitude, longitude] */
  lat_lon: [number, number];
  
  /** Pass through from GTFS, Absent when null. */
  code?: string;
  
  /** Pass through from GTFS, Absent when null. */
  platformCode?: string;

  /** Pass through from GTFS, Absent when null. */
  locationType?: string;
}

// ---------------------------------------------------------------------------
// Period section  (one service-calendar slice within a stop timetable)
// ---------------------------------------------------------------------------

export interface PeriodSection {
  /** Index into the top-level periods array. */
  period: number;
  routeStopTimes: RouteStopTimes[];
}

// ---------------------------------------------------------------------------
// Route stop times
// ---------------------------------------------------------------------------

export interface RouteStopTimes {
  stopOnRoutePosition: StopOnRoutePosition;
  /** References Route.routeId in the top-level routes array. */
  route: string;
  /**
   * Compressed trip-ID array (TripIdEncoder).
   * Byte layout: [uint8:n][uint8:flags][n×uint8:permutation][entries…]
   * flags bit 0: sort order — 0 = lexicographic, 1 = reversed-lexicographic.
   * Each entry: [uint8:prefixLen][uint8:suffixLen][suffixLen×uint8:suffix UTF-8].
   * Base64-standard encoded.
   */
  tripIds: string;
  /**
   * Delta + variable-byte encoded arrival times in seconds since midnight.
   * Sorted ascending. Delta-coded, then each delta encoded as 7 bits/byte
   * (MSB = more bytes follow). Base64-standard encoded.
   */
  arrivalTimes: string;
  /**
   * Same encoding as arrivalTimes, for departure times.
   * Absent when departure times are identical to arrival times.
   */
  departureTimes?: string;
}

// ---------------------------------------------------------------------------
// Stop-on-route position
// ---------------------------------------------------------------------------

export interface StopOnRoutePosition {
  /** 0-based stop sequence index within the route shape. */
  sequence: number;
  /**
   * Present and true when the stop time was interpolated rather than
   * explicitly scheduled. Absent when false.
   */
  interpolated?: true;
  /** Absent when this is the first stop on the route. Index into sids. */
  prevStopId?: number;
  /** Absent when this is the first stop on the route. Index into snames. */
  prevStopName?: number;
  /** Absent when this is the last stop on the route. Index into sids. */
  nextStopId?: number;
  /** Absent when this is the last stop on the route. Index into snames. */
  nextStopName?: number;
  /** Index into sids. */
  firstStopId: number;
  /** Index into snames. */
  firstStopName: number;
  /** Index into sids. */
  lastStopId: number;
  /** Index into snames. */
  lastStopName: number;
}
