import { access, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const files = [
  './generated/prisma/browser.js',
  './generated/prisma/client.js',
  './dist/generated/prisma/browser.js',
  './dist/generated/prisma/client.js',
];

const replacePattern = "export * as $Enums from './enums.js';";
const replacement = "import * as $Enums from './enums.js';\nexport { $Enums };";

for (const relativePath of files) {
  const filePath = resolve(relativePath);
  try {
    await access(filePath);
  } catch {
    continue;
  }

  let content = await readFile(filePath, 'utf8');
  if (!content.includes(replacePattern)) {
    continue;
  }
  content = content.replace(replacePattern, replacement);
  await writeFile(filePath, content, 'utf8');
}
