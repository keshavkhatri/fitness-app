import { KeyValueStorage } from '../key-value-storage';

/** In-memory `KeyValueStorage` for tests. Set `failWrites` to simulate a full/unavailable store. */
export class MemoryKeyValueStorage implements KeyValueStorage {
  readonly values = new Map<string, string>();
  failWrites = false;

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    if (this.failWrites) {
      throw new Error('Storage unavailable');
    }
    this.values.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.values.delete(key);
  }
}
