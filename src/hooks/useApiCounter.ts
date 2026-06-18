import { useState, useEffect, useCallback, useRef } from 'react';
import { API_ENDPOINTS } from '../config';

const STORAGE_KEY = 'dj_mixer_api_count';

export function useApiCounter() {
  const [count, setCount] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? parseInt(saved, 10) : 0;
  });
  const countRef = useRef(count);
  const [loading, setLoading] = useState(false);

  useEffect(() => { countRef.current = count; }, [count]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, String(count)); }, [count]);

  const increment = useCallback((n = 1) => {
    setCount(prev => prev + n);
  }, []);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.STATS);
      if (res.ok) {
        const data = await res.json();
        setCount(data.requests || 0);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  return { count, increment, fetchStats, loading };
}
