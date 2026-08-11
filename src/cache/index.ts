import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * Content-addressed JSON cache under .survived/cache. Keys embed only
 * immutable identities (commit hashes, snapshot hashes, paths), so entries
 * never need invalidation. Corrupt or unreadable entries are misses, never
 * errors — the engine just recomputes.
 */
export class DiskCache {
  constructor(private readonly dir: string) {}

  private pathFor(key: string): string {
    const h = createHash('sha256').update(key).digest('hex');
    return join(this.dir, h.slice(0, 2), `${h.slice(2)}.json`);
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      return JSON.parse(await readFile(this.pathFor(key), 'utf8')) as T;
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(value));
    await rename(tmp, path);
  }
}
