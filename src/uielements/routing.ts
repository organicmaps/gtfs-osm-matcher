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

export function parseDsAndId(hashString: string, datasets: string[]) {
    const reportMatch = hashString.match(`/selection/(${datasets.join('|')})/([^/]+)`);
    if (reportMatch && reportMatch[1]) {
        return {
            dataset: reportMatch[1],
            featureId: reportMatch[2],
        };
    }
}