import { TagStatistics } from "./OSMData";

export function filterTagStatsByRe(tags: TagStatistics, re: RegExp) {
    const result = {};
    // @ts-ignore
    for (const [key, value] of tags) {
        if (re.test(key)) {
            // @ts-ignore
            result[key] = value;
        }
    }
    return result as TagStatistics;
}

export type tagCB = (tag: string) => void;

export function findMostPopularTag(refTags: TagStatistics, treshold: number, callback: tagCB) {
    if (refTags && callback) {
        const mostPopular = Object.entries(refTags).sort((e1, e2) => e2[1] - e1[1])[0];
        if (mostPopular) {
            const [tagKey, tagCount] = mostPopular;
            if (tagCount > treshold) {
                callback(tagKey);
            }
        }
    }
}

