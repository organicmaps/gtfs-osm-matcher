// Type definitions for the schedule tile JSON produced by JsonEncoder.encodeTimetablesAsJson.
// Format version 4: stop-centric timetables with route entries as parallel arrays.

// ---------------------------------------------------------------------------
// Top-level tile
// ---------------------------------------------------------------------------

export interface Schedule {
  feed: string;
  /** Deduplicated route descriptors, referenced by RouteEntry.route index. */
  routes: Route[];
  /** Deduplicated stop objects, referenced by StopTimetable.stop index. */
  stops: Stop[];
  periods: Periods;
  /**
   * Deduplicated stop-on-route position blobs.
   * Each entry is a base64url (no padding) VLQ-encoded array of 9 integers:
   *   [sequence, prevStopId, prevStopName, nextStopId, nextStopName,
   *    firstStopId, firstStopName, lastStopId, lastStopName]
   * where prevStopId/prevStopName/nextStopId/nextStopName are absent (−1) at
   * the first/last stop of a route. Referenced by RouteEntry.pos entries.
   * See decodePosArray() in ScheduleEncoding.ts for the decoding convention.
   */
  pos: string[];
  /** List of unique stop names referenced by pos entries (index into snames). */
  snames: string[];
  /** List of unique stop IDs referenced by pos entries (index into sids). */
  sids: string[];
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
// Stop
// ---------------------------------------------------------------------------

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
// Stop timetable
// ---------------------------------------------------------------------------

export interface StopTimetable {
  /** Index into the top-level stops[] array. */
  stop: number;
  /** Route entries for this stop, one per (route, stop-sequence) pair. */
  routes: RouteEntry[];
}

// ---------------------------------------------------------------------------
// Route entry  (one route/direction serving this stop)
// ---------------------------------------------------------------------------

export interface RouteEntry {
  /** Index into the top-level routes[] array. */
  route: number;

  /**
   * Parallel arrays — one element per service period served at this stop on
   * this route.  All five arrays have the same length.
   */

  /** Period indexes into Periods.data[]. */
  periods: number[];

  /**
   * Indexes into the top-level pos[] array — one per period.
   * Decode each pos blob with decodePosArray() from ScheduleEncoding.ts.
   */
  pos: number[];

  /**
   * Compressed trip-ID arrays, one per period (TripIdEncoder).
   * Byte layout: [uint8:n][uint8:flags][n×uint8:permutation][entries…]
   * flags bit 0: sort order — 0 = lexicographic, 1 = reversed-lexicographic.
   * flags bit 1: template mode — prefix/suffix/paddingWidth then delta-coded numeric middles.
   * Each entry (non-template): [uint8:prefixLen][uint8:suffixLen][suffixLen×uint8:suffix UTF-8].
   * Base64-standard encoded.
   */
  tripIds: string[];

  /**
   * Delta + variable-byte encoded arrival times in seconds since midnight,
   * one blob per period.
   * Sorted ascending. Delta-coded, then each delta encoded as 7 bits/byte
   * (MSB = more bytes follow). Base64-standard encoded.
   */
  arrivalTimes: string[];

  /**
   * Same encoding as arrivalTimes, for departure times, one blob per period.
   * Absent when departure times are identical to arrival times for ALL periods.
   * When present, a null entry means arrivals == departures for that period.
   */
  departureTimes?: (string | null)[];
}
