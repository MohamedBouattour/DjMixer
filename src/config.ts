// In production, the frontend is on Render and backend is on the VPS.
// In development, Vite proxy handles routing to localhost:3002.
export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://79.137.14.75:3002/api";

export const API_ENDPOINTS = {
  SEARCH: `${API_BASE_URL}/search`,
  STREAM: `${API_BASE_URL}/stream`,
  AUTH: `${API_BASE_URL}/auth`,
  CACHE: `${API_BASE_URL}/cache`,
  CACHE_LIST: `${API_BASE_URL}/cache`, // Added for consistency
  DOWNLOAD: `${API_BASE_URL}/download`, // Added for consistency
  SYNC: `${API_BASE_URL}/cache/sync`,
  VERSION: `${API_BASE_URL}/version`,
};
