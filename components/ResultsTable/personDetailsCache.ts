import type { PersonEventDetails } from "@/lib/person-event-details";

const MAX_ENTRIES = 128;
const MAX_BYTES = 64 * 1024 * 1024;

type CacheEntry = {
  value: PersonEventDetails;
  bytes: number;
};

function estimateBytes(value: PersonEventDetails) {
  return JSON.stringify(value).length * 2;
}

class PersonDetailsCache {
  private readonly entries = new Map<string, CacheEntry>();
  private bytes = 0;

  get(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: PersonEventDetails) {
    const bytes = estimateBytes(value);
    const previous = this.entries.get(key);
    if (previous) this.bytes -= previous.bytes;
    this.entries.delete(key);

    if (bytes > MAX_BYTES) return;
    this.entries.set(key, { value, bytes });
    this.bytes += bytes;
    while (this.entries.size > MAX_ENTRIES || this.bytes > MAX_BYTES) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = this.entries.get(oldestKey);
      this.entries.delete(oldestKey);
      if (oldest) this.bytes -= oldest.bytes;
    }
  }
}

export const personDetailsCache = new PersonDetailsCache();
