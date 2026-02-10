'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, Run } from '@/lib/api';

/**
 * Fetches run history from the backend and provides it as a list.
 * Polls periodically to pick up newly completed runs.
 */
export interface UseRunHistoryReturn {
  runs: Run[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useRunHistory(
  pollIntervalMs: number = 30_000,
): UseRunHistoryReturn {
  const [runs, setRuns] = useState<Run[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchRuns = useCallback(async () => {
    try {
      const data = await api.runs.list();
      // Normalise: the backend may return _id instead of id
      const normalised = data.map((r: Record<string, unknown>) => ({
        ...r,
        id: (r.id || r._id) as string,
        status: r.status as Run['status'],
      })) as Run[];
      setRuns(normalised);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch run history:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  // Periodic poll
  useEffect(() => {
    if (pollIntervalMs <= 0) return;
    const interval = setInterval(fetchRuns, pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchRuns, pollIntervalMs]);

  return { runs, isLoading, error, refresh: fetchRuns };
}
