const VITE_DATA_BASE_URL = import.meta.env.VITE_DATA_BASE_URL;

export const DATA_BASE_URL = VITE_DATA_BASE_URL ? 
    (VITE_DATA_BASE_URL.endsWith('/') ? VITE_DATA_BASE_URL.slice(0, -1) : VITE_DATA_BASE_URL) : 
    '/data';
