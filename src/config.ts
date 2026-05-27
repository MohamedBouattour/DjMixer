export const API_BASE_URL = import.meta.env.VITE_API_URL || "https://79.137.14.75/api";

export const API_ENDPOINTS = {
  SEARCH: `${API_BASE_URL}/search`,
  STREAM: `${API_BASE_URL}/stream`,
  AUTH: `${API_BASE_URL}/auth`,
  DOWNLOAD: `${API_BASE_URL}/stream`,
  VERSION: `${API_BASE_URL}/version`,
  USER_TRACKS: (uid: string) => `${API_BASE_URL}/users/${uid}/tracks`,
  SUGGEST: `${API_BASE_URL}/suggest`,
  SMART_SUGGEST: `${API_BASE_URL}/smart-suggest`,
};
