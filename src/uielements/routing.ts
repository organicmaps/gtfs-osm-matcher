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
    /** `/selection/stop/…` vs `/selection/route/…`. Legacy bare `/selection/{id}` and
     *  `/preview/{id}` links are stop links — the preview panel this app no longer has
     *  only ever pointed at stops. */
    kind: 'stop' | 'route';
    /**
     * True where the hash said `/preview/`. Those links were written by the preview panel
     * this app no longer has, and some of their ids -- a generated station's, for one -- were
     * never rows of `index.tsv`. An id from one of them that resolves to nothing is a link
     * from an older build, not a report with something missing.
     */
    legacy: boolean;
};

// `…/selection/stop/{id}` names a stop of the report; `…/selection/route/{id}` names a route
// of `routes.ndjson`. A bare `…/selection/{id}` (no kind) and `…/preview/{id}` are read as a
// stop: the kind was added when route deep-links landed, and the preview panel this app no
// longer has only ever pointed at stops. The category is not in the URL; it is recovered
// from index.tsv. The id is percent-encoded by whoever wrote the hash, since GTFS ids are
// free-form and a raw '/' would end the segment here.
export function parseSelectionHash(hashString: string): SelectionHash | undefined {
    const typed = hashString.match(/\/selection\/(stop|route)\/([^/]+)/);
    if (typed) {
        return { id: decodeId(typed[2]), kind: typed[1] as 'stop' | 'route', legacy: false };
    }
    const legacy = hashString.match(/\/(selection|preview)\/([^/]+)/);
    if (legacy) {
        return { id: decodeId(legacy[2]), kind: 'stop', legacy: legacy[1] === 'preview' };
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
