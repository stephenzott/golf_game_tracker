import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const distSw = join(dirname(fileURLToPath(import.meta.url)), '../dist/sw.js');
const version = Date.now();
const updated = readFileSync(distSw, 'utf8').replace(
  /const CACHE_NAME = 'golf-tracker-[^']+'/,
  `const CACHE_NAME = 'golf-tracker-v${version}'`
);
writeFileSync(distSw, updated);
console.log(`SW cache versioned: golf-tracker-v${version}`);
