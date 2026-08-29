/**
 * A tiny fetch wrapper that memoises a Promise by key and evicts the key on failure,
 * so a transient error does not pin a cached rejection for the whole session.
 */
export function memoFetch<T>(cache: { [key: string]: Promise<T> }, key: string, fn: () => Promise<T>): Promise<T> {
    if (!cache[key]) {
        cache[key] = fn().catch(e => { delete cache[key]; throw e; });
    }
    return cache[key];
}