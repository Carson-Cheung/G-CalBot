import { useEffect, useState } from 'react';
import { api } from '../api';

export interface HealthState {
  postgres: boolean;
  userCount: number | null;
}

function parseUserCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

export function useHealth(): HealthState | null {
  const [health, setHealth] = useState<HealthState | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getHealth(controller.signal)
      .then((data) =>
        setHealth({
          postgres: data.storage === 'neon-postgresql',
          userCount: parseUserCount(data.userCount),
        })
      )
      .catch(() => {
        if (!controller.signal.aborted) setHealth({ postgres: false, userCount: null });
      });
    return () => controller.abort();
  }, []);

  return health;
}
