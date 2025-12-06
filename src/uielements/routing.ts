import { useSyncExternalStore } from "preact/compat";


export function useHash() {
    return useSyncExternalStore(subscribe, () => window.location.hash);
}

function subscribe(callback: () => void) {
    window.addEventListener("hashchange", callback);
    return () => {
        window.removeEventListener("hashchange", callback);
    }
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