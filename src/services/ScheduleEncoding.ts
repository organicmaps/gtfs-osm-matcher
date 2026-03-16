
// ---------------------------------------------------------------------------
// tripIds  — TripIdEncoder
// ---------------------------------------------------------------------------
// Byte layout:
//   [uint8: n]
//   [uint8: flags]   bit 0 → 0 = lex sort, 1 = reversed-lex sort
//   [n × uint8: sort permutation]  perm[i] = original index of the i-th sorted entry
//   then for each sorted entry:
//     [uint8: prefixLen] [uint8: suffixLen] [suffixLen bytes: UTF-8 suffix]
//
// Base64-standard encoded (not URL-safe).

export function decodeTripIds(base64: string): string[] {
  if (!base64) return [];

  const bytes = base64ToBytes(base64);
  let pos = 0;

  const n     = bytes[pos++];
  const flags = bytes[pos++];
  const reversed = (flags & 0x01) !== 0;

  const perm = new Uint8Array(n);
  for (let i = 0; i < n; i++) perm[i] = bytes[pos++];

  const decoder = new TextDecoder();
  const sorted: string[] = [];
  let prev = "";

  for (let i = 0; i < n; i++) {
    const prefixLen = bytes[pos++];
    const suffixLen = bytes[pos++];
    const suffix = decoder.decode(bytes.subarray(pos, pos + suffixLen));
    pos += suffixLen;
    const cur = prev.slice(0, prefixLen) + suffix;
    sorted.push(cur);
    prev = cur;
  }

  if (reversed) {
    for (let i = 0; i < n; i++) sorted[i] = sorted[i].split("").reverse().join("");
  }

  const result = new Array<string>(n);
  for (let i = 0; i < n; i++) result[perm[i]] = sorted[i];
  return result;
}

// ---------------------------------------------------------------------------
// arrivalTimes / departureTimes  — IntArrayEncoder
// ---------------------------------------------------------------------------
// Encoding:
//   1. Delta-code the sorted input (first value stored as-is).
//   2. Variable-byte encode each delta: 7 bits per byte, MSB set = more bytes follow.
//   3. Base64-standard encode the resulting bytes.

export function decodeIntArray(base64: string): number[] {
  if (!base64) return [];

  const bytes = base64ToBytes(base64);
  const deltas: number[] = [];
  let pos = 0;

  while (pos < bytes.length) {
    let value = 0;
    let shift = 0;
    let b: number;
    do {
      b = bytes[pos++];
      value |= (b & 0x7F) << shift;
      shift += 7;
    } while (b & 0x80);
    deltas.push(value);
  }

  const result = new Array<number>(deltas.length);
  result[0] = deltas[0];
  for (let i = 1; i < deltas.length; i++) result[i] = result[i - 1] + deltas[i];
  return result;
}

// ---------------------------------------------------------------------------
// Periods decompression
// ---------------------------------------------------------------------------

type PeriodsInput = {
  encoding: string;
  compression: string;
  begin?: number;
  end?: number;
  data: Array<string> | string;
};

/**
 * Decompresses a Periods object into an array of raw bits strings, one per
 * period in index order. For encoding "begin:end:bits" each string includes
 * the 4-byte header and is suitable for decodePeriodBits() / isServiceDay().
 * For encoding "bits" the strings are headerless bit vectors; use
 * servicePeriodIndexes() to query by date in that case.
 */
export function decompressPeriods(periods: PeriodsInput): string[] {
  return decompressRaw(periods);
}

/**
 * Returns the indexes of periods that have service on the given date.
 * date must be at UTC midnight (e.g. new Date(Date.UTC(2025, 0, 6))).
 */
export function servicePeriodIndexes(periods: PeriodsInput, date: Date): number[] {
  const key = dateKey(date);
  const result: number[] = [];
  const rawBits = decompressRaw(periods);

  if (periods.encoding === "bits" && periods.begin != null && periods.end != null) {
    for (let i = 0; i < rawBits.length; i++) {
      if (!rawBits[i]) continue;
      const days = bitsToServiceDays(periods.begin, periods.end, base64UrlToBytes(rawBits[i]));
      if (days.serviceDates.has(key)) result.push(i);
    }
  } else {
    for (let i = 0; i < rawBits.length; i++) {
      const days = decodePeriodBits(rawBits[i]);
      if (days?.serviceDates.has(key)) result.push(i);
    }
  }
  return result;
}

function decompressRaw(periods: PeriodsInput): string[] {
  if (periods.compression === "rle")
    return (periods.data as Array<string>).map(rleToRawBitsBase64);
  if (periods.compression === "transpose_rle")
    return transposeRleToRawBitsArray(periods.data as string);
  return periods.data as Array<string>;
}

// RLE → raw bits Base64-URL: the stored value is base64 of RLE-encoded chars
// of the original bits Base64-URL string. Decode: outer base64 → RLE bytes →
// reconstruct the inner Base64-URL string (which is the raw bits blob).
function rleToRawBitsBase64(rleBase64: string): string {
  const bytes = base64UrlToBytes(rleBase64);
  let pos = 0;
  let result = "";
  while (pos < bytes.length) {
    const ch = String.fromCharCode(bytes[pos++]);
    let count = 0, shift = 0, b: number;
    do { b = bytes[pos++]; count |= (b & 0x7F) << shift; shift += 7; } while (b & 0x80);
    result += ch.repeat(count);
  }
  return result;
}

// transpose_rle → array of raw bits strings, one per period in sorted-row order.
function transposeRleToRawBitsArray(base64: string): string[] {
  if (!base64) return [];
  const bytes = base64UrlToBytes(base64);
  if (bytes.length < 6) return [];

  let pos = 0;
  const readU16 = () => { const v = ((bytes[pos] & 0xFF) << 8) | (bytes[pos + 1] & 0xFF); pos += 2; return v; };

  const n           = readU16();
  const globalBegin = readU16();
  const globalEnd   = readU16();
  const span        = globalEnd - globalBegin + 1;

  const begins = new Uint16Array(n);
  const ends   = new Uint16Array(n);
  for (let i = 0; i < n; i++) begins[i] = readU16();
  for (let i = 0; i < n; i++) ends[i]   = readU16();

  const zeros = new Uint16Array(span);
  for (let col = 0; col < span; col++) zeros[col] = readU16();

  const result: string[] = [];
  for (let i = 0; i < n; i++) {
    const beginDay  = begins[i];
    const endDay    = ends[i];
    const pSpan     = endDay - beginDay + 1;
    const raw       = new Uint8Array(4 + ((pSpan + 7) >>> 3));
    raw[0] = beginDay >>> 8; raw[1] = beginDay & 0xFF;
    raw[2] = endDay   >>> 8; raw[3] = endDay   & 0xFF;
    const colOffset = beginDay - globalBegin;
    for (let d = 0; d < pSpan; d++) {
      const col = colOffset + d;
      if (col >= 0 && col < span && zeros[col] <= i)
        raw[4 + (d >>> 3)] |= 1 << (d & 7);
    }
    result.push(bytesToBase64Url(raw));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Period.bits  — GtfsCalendarEncoder  (uncompressed / "rle" after decompression)
// ---------------------------------------------------------------------------
// Base64-URL (no padding) binary blob:
//   bytes [0..1] — begin date as uint16 big-endian (days since 2000-01-01)
//   bytes [2..3] — end   date as uint16 big-endian (days since 2000-01-01)
//   bytes [4+]   — bit-vector, LSB-first; bit N set = service on (begin + N days)

const EPOCH_MS = Date.UTC(2000, 0, 1); // 2000-01-01 UTC
const MS_PER_DAY = 86_400_000;

export interface ServiceDays {
  /** UTC midnight of the first day in the window. */
  begin: Date;
  /** UTC midnight of the last day in the window. */
  end: Date;
  /**
   * Compact numeric date keys: (year % 100) * 10000 + month * 100 + day.
   * E.g. 2025-06-15 → 250615.
   */
  serviceDates: Set<number>;
}

function dateKey(date: Date): number {
  return (date.getUTCFullYear() % 100) * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
}

function bitsToServiceDays(beginDay: number, endDay: number, bitVector: Uint8Array): ServiceDays {
  const begin = new Date(EPOCH_MS + beginDay * MS_PER_DAY);
  const end   = new Date(EPOCH_MS + endDay   * MS_PER_DAY);
  const span  = endDay - beginDay + 1;
  const serviceDates = new Set<number>();
  for (let n = 0; n < span; n++) {
    if ((bitVector[n >>> 3] & (1 << (n & 7))) !== 0) {
      serviceDates.add(dateKey(new Date(EPOCH_MS + (beginDay + n) * MS_PER_DAY)));
    }
  }
  return { begin, end, serviceDates };
}

/**
 * Decodes Period.bits into the set of dates on which service runs.
 * begin and end are embedded in the first 4 bytes of the blob.
 * Use this only when Periods.compression is absent or the blob has already
 * been decompressed (e.g. via decodeRlePeriodBits).
 */
export function decodePeriodBits(bits: string): ServiceDays | null {
  if (!bits) return null;

  const bytes = base64UrlToBytes(bits);
  if (bytes.length < 4) return null;

  const beginDay = ((bytes[0] & 0xFF) << 8) | (bytes[1] & 0xFF);
  const endDay   = ((bytes[2] & 0xFF) << 8) | (bytes[3] & 0xFF);
  return bitsToServiceDays(beginDay, endDay, bytes.slice(4));
}

/**
 * Returns true if service runs on the given date.
 * bits must be an uncompressed Base64-URL bits string (as returned by
 * decompressPeriods()). date must be at UTC midnight.
 */
export function isServiceDay(bits: string, date: Date): boolean {
  const days = decodePeriodBits(bits);
  if (!days) return false;
  return days.serviceDates.has(dateKey(date));
}

// ---------------------------------------------------------------------------
// Base64 helpers
// ---------------------------------------------------------------------------

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlToBytes(base64url: string): Uint8Array {
  // URL-safe alphabet → standard alphabet, add padding
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return base64ToBytes(padded);
}


function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
