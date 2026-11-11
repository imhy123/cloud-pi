import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
for (const subpath of Object.keys(manifest.exports)) {
	const specifier = subpath === '.' ? manifest.name : manifest.name + subpath.slice(1);
	test(`${specifier} imports without a global Bun`, () => {
		const script = `delete globalThis.Bun; const mod = await import(${JSON.stringify(specifier)}); if (!Object.keys(mod).length) throw new Error('empty exports'); if ('Bun' in globalThis) throw new Error('Bun leaked');`;
		const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: new URL('../..', import.meta.url), encoding: 'utf8' });
		assert.equal(result.status, 0, result.stderr);
	});
}
test('built package renders text and parses keys', async () => {
	const { Text, parseKey, visibleWidth } = await import('@cloud-pi/tui');
	assert.equal(visibleWidth(new Text('你好', 0, 0).render(4)[0]), 4);
	assert.equal(parseKey('\x1b[A'), 'up');
});
