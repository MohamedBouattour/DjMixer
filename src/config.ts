// In production, the frontend is on Render and backend is on the VPS.
// In development, Vite proxy handles routing to localhost:3002.
export const API_BASE_URL = import.meta.env.VITE_API_URL || "";

export const API_ENDPOINTS = {
  SEARCH: `${API_BASE_URL}/search`,
  STREAM: `${API_BASE_URL}/stream`,
  AUTH: `${API_BASE_URL}/auth`,
};
