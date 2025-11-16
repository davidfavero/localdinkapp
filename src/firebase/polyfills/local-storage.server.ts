// Ensures Firebase and other browser-only libraries don't choke on Node's
// experimental localStorage implementation when rendering on the server.
if (typeof window === 'undefined') {
  const globalRef = globalThis as typeof globalThis & {
    localStorage?: Storage;
  };

  const shouldPolyfill =
    typeof globalRef.localStorage !== 'undefined' &&
    typeof globalRef.localStorage?.getItem !== 'function';

  if (shouldPolyfill) {
    const store = new Map<string, string>();

    const memoryStorage = {
      get length() {
        return store.size;
      },
      clear() {
        store.clear();
      },
      getItem(key: string) {
        return store.get(key) ?? null;
      },
      key(index: number) {
        return Array.from(store.keys())[index] ?? null;
      },
      removeItem(key: string) {
        store.delete(key);
      },
      setItem(key: string, value: string) {
        store.set(key, String(value));
      },
    } as Storage;

    try {
      globalRef.localStorage = memoryStorage;
    } catch {
      Object.defineProperty(globalRef, 'localStorage', {
        value: memoryStorage,
        configurable: true,
        writable: true,
      });
    }
  }
}
