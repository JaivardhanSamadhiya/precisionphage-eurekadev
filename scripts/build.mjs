import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const output = resolve(root, 'dist');
if (!output.startsWith(root + sep)) throw new Error('Build output must remain inside the repository.');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(resolve(root, 'public'), output, { recursive: true });
console.log('Built static website in dist/');
