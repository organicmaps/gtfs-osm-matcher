import { useRef, useSyncExternalStore } from "preact/compat";


export function useHash() {
    const hashRef = useRef<String>(window.location.hash);
    return useSyncExternalStore((callback) => {
        window.addEventListener("hashchange", () => {
            if (hashRef.current !== window.location.hash) {
                hashRef.current = window.location.hash;

                if (import.meta.env.DEV) {
                    console.log('Hash changed', hashRef.current);
                }

                callback();
            }
        });

        return () => {
            window.removeEventListener("hashchange", callback);
        }
    }, () => window.location.hash);
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

// `…/preview/{id}` for timetable preview, `…/selection/{id}` for everything else.
// The category is no longer part of the URL — it is recovered from index.tsv.
export function parseSelectionHash(hashString: string): SelectionHash | undefined {
    const match = hashString.match(/\/(preview|selection)\/([^/]+)/);
    if (match) {
        return {
            kind: match[1] as 'preview' | 'selection',
            id: match[2],
        };
    }
}