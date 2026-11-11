import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = readdirSync(new URL('../test/bundle/', import.meta.url)).filter(name => name.endsWith('.test.mjs')).sort();
if (!files.length) throw new Error('No bundle tests found');
const result = spawnSync(process.execPath, ['--test', ...files.map(name => new URL(`../test/bundle/${name}`, import.meta.url).pathname)], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
