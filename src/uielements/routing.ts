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
    kind: 'preview' | 'selection';
    id: string;
};

// `…/preview/{id}` for a stop in the matcher's own output, `…/selection/{id}` for one in
// the match report. The category is no longer part of the URL — it is recovered from
// index.tsv. The id is percent-encoded by whoever wrote the hash, since GTFS ids are
// free-form and a raw '/' would end the segment here.
export function parseSelectionHash(hashString: string): SelectionHash | undefined {
    const match = hashString.match(/\/(preview|selection)\/([^/]+)/);
    if (match) {
        return {
            kind: match[1] as 'preview' | 'selection',
            id: decodeId(match[2]),
        };
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
