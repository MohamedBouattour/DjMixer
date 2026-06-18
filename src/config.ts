// Both in development (Vite proxy) and production (Nginx proxy),
// the API is accessible via the /api path relative to the current origin.
export const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

export const API_ENDPOINTS = {
  SEARCH: `${API_BASE_URL}/search`,
  STREAM: `${API_BASE_URL}/stream`,
  VERSION: `${API_BASE_URL}/version`,
  RECOMMEND: `${API_BASE_URL}/recommend`,
  STATS: `${API_BASE_URL}/stats`,
};
