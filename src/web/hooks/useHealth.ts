import { useEffect, useState } from 'react';
import { api } from '../api';

export function useHealth(): { postgres: boolean } | null {
  const [health, setHealth] = useState<{ postgres: boolean } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getHealth(controller.signal)
      .then(data => setHealth({ postgres: data.storage === 'neon-postgresql' }))
      .catch(() => {
        if (!controller.signal.aborted) setHealth({ postgres: false });
      });
    return () => controller.abort();
  }, []);

  return health;
}
