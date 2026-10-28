import { useCallback, useState } from 'react';

export function useScheduleFilters() {
  const [selectedFeed, setSelectedFeed] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  const clearAll = useCallback(() => {
    setSearchQuery('');
    setSelectedDayKey(null);
    setSelectedFeed('all');
  }, []);

  const isFiltered = Boolean(searchQuery || selectedDayKey || selectedFeed !== 'all');

  return {
    selectedFeed,
    setSelectedFeed,
    searchQuery,
    setSearchQuery,
    selectedDayKey,
    setSelectedDayKey,
    clearAll,
    isFiltered,
  };
}

export type ScheduleFilters = ReturnType<typeof useScheduleFilters>;
