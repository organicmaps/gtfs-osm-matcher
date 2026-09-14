import { useRef, useSyncExternalStore, useCallback } from "preact/compat";


export function useHash() {
    const hashRef = useRef<String>(window.location.hash);
    return useSyncExternalStore(
        useCallback((callback: () => void) => {
            const onChange = () => {
                if (hashRef.current !== window.location.hash) {
                    hashRef.current = window.location.hash;
                    if (import.meta.env.DEV) {
                        console.log('Hash changed', hashRef.current);
                    }
                    callback();
                }
            };
            window.addEventListener("hashchange", onChange);
            return () => window.removeEventListener("hashchange", onChange);
        }, []),
        () => window.location.hash
    );
}

export function useHashRoute<T>(parser: (hashString: string) => T) {
    const hash = useHash();
    return parser(hash);
}

export function parseUrlReportRegion(hashString: string) {
    const reportMatch = hashString.match(/\/match-report\/([\w0-9-_]+)/);
    if (reportMatch && reportMatch[1]) {
        return reportMatch[1];
    }
}

export type SelectionHash = {
    id: string;
    /**
     * True where the hash said `/preview/`. Those links were written by the preview panel
     * this app no longer has, and some of their ids -- a generated station's, for one -- were
     * never rows of `index.tsv`. An id from one of them that resolves to nothing is a link
     * from an older build, not a report with something missing.
     */
    legacy: boolean;
};

// `…/selection/{id}` names a stop of the report. `…/preview/{id}` is read as the same
// thing: the preview used to be a dataset of its own with its own links, and is now a way
// of drawing the report's stops. Most of those ids are report stops and still resolve; the
// ones that are not — a generated station the preview minted — are reported as unknown
// rather than silently ignored. The category is not in the URL at all; it is recovered
// from index.tsv. The id is percent-encoded by whoever wrote the hash, since GTFS ids are
// free-form and a raw '/' would end the segment here.
export function parseSelectionHash(hashString: string): SelectionHash | undefined {
    const match = hashString.match(/\/(preview|selection)\/([^/]+)/);
    if (match) {
        return { id: decodeId(match[2]), legacy: match[1] === 'preview' };
    }
}

/** A '%' that is not an escape is a link from before the ids were encoded, not an error. */
function decodeId(raw: string): string {
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}
