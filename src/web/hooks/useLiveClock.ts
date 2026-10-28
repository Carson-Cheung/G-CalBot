import { useEffect, useState } from 'react';
import { formatClock } from '../utils/dates';

export function useLiveClock(timezone: string): string {
  const [time, setTime] = useState(() => formatClock(new Date(), timezone));

  useEffect(() => {
    const update = () => setTime(formatClock(new Date(), timezone));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [timezone]);

  return time;
}
