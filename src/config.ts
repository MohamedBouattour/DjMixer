// Use relative paths to let the Vite proxy (dev) or the Express server (prod) handle routing.
// This is the most robust way to ensure the frontend can always find the backend.
export const API_BASE_URL = '';

export const API_ENDPOINTS = {
    SEARCH: '/search',
    STREAM: '/stream',
    AUTH: '/auth',
};
