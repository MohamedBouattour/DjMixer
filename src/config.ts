// Remote API Server
export const API_BASE_URL = import.meta.env.PROD
    ? 'https://djmixer.onrender.com'
    : 'http://8.208.92.79:3002';

export const API_ENDPOINTS = {
    SEARCH: `${API_BASE_URL}/search`,
    STREAM: `${API_BASE_URL}/stream`,
    AUTH: `${API_BASE_URL}/auth`,
};
