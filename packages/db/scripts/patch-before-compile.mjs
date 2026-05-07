/**
 * Patches generated/prisma/client.ts before tsc compilation.
 * Removes the ESM-only import.meta.url block — in CJS, __dirname is already a global.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const clientPath = resolve('./generated/prisma/client.ts');
let content = await readFile(clientPath, 'utf8');

const esmBlock =
  `import * as path from 'node:path'\n` +
  `import { fileURLToPath } from 'node:url'\n` +
  `globalThis['__dirname'] = path.dirname(fileURLToPath(import.meta.url))`;

if (content.includes(esmBlock)) {
  content = content.replace(esmBlock, '// __dirname is available natively in CJS');
  await writeFile(clientPath, content, 'utf8');
  console.log('✔ Patched client.ts: removed import.meta.url block');
} else {
  console.log('ℹ client.ts already patched or block not found — skipping');
}
