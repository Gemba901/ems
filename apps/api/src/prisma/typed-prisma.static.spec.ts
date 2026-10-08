import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Casting the Prisma client to `any` hides missing organizationId filters and
// schema drift from the compiler, so it is banned outside specs.
const UNTYPED_PRISMA = [
  /\(\s*(this\.)?(prisma|db|tx)(\.\w+)?\s+as\s+any\s*\)/,
  /=\s*(this\.)?(prisma|db|tx)\s+as\s+any\b/,
  /\b(prisma|db|tx|client)\s*:\s*any\b/,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('typed Prisma access', () => {
  it('never casts the Prisma client or a transaction to any', () => {
    const root = join(__dirname, '..');
    const offenders = sourceFiles(root).flatMap((file) =>
      readFileSync(file, 'utf8').split('\n').flatMap((line, i) =>
        UNTYPED_PRISMA.some((pattern) => pattern.test(line)) ? [`${relative(root, file)}:${i + 1}`] : [],
      ),
    );
    expect(offenders).toEqual([]);
  });
});
