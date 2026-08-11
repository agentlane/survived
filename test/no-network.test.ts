import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcDir = fileURLToPath(new URL('../src', import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
  });
}

// Product contract: zero network I/O anywhere in the codebase.
const bannedImport = /from\s+['"](node:)?(http|https|net|dns|tls|dgram|http2)['"]/;
const bannedRequire = /require\(\s*['"](node:)?(http|https|net|dns|tls|dgram|http2)['"]\s*\)/;
const bannedFetch = /\bfetch\s*\(/;

describe('no network I/O in src/', () => {
  it('has source files to scan', () => {
    expect(walk(srcDir).length).toBeGreaterThan(0);
  });

  it('imports no network modules and calls no fetch', () => {
    for (const file of walk(srcDir)) {
      const text = readFileSync(file, 'utf8');
      expect(text, `${file} imports a network module`).not.toMatch(bannedImport);
      expect(text, `${file} requires a network module`).not.toMatch(bannedRequire);
      expect(text, `${file} calls fetch`).not.toMatch(bannedFetch);
    }
  });
});
