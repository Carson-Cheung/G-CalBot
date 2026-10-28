const memoryStorage = new Map<string, string>();

// localStorage throws SecurityError inside the cross-origin Activity iframe, so fall back to memory.
export const safeStorage = {
  getItem(key: string): string | null {
    try {
      return window.localStorage.getItem(key) ?? memoryStorage.get(key) ?? null;
    } catch {
      return memoryStorage.get(key) ?? null;
    }
  },
  setItem(key: string, value: string): void {
    memoryStorage.set(key, value);
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // storage unavailable; memory copy is enough
    }
  },
  removeItem(key: string): void {
    memoryStorage.delete(key);
    try {
      window.localStorage.removeItem(key);
    } catch {
      // storage unavailable; memory copy already cleared
    }
  },
};
