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

test('built SVG and Mermaid workers locate their JS entry, WASM and dependencies', () => {
	const script = `
	 delete globalThis.Bun;
	 const { rasterizeSvg, setSvgFontOptions, getImageDimensions, Markdown, getMarkdownTheme, closeMediaWorkers } = await import('@cloud-pi/tui');
	 try {
	  setSvgFontOptions({loadSystemFonts:false});
	  const png = await rasterizeSvg(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="7"><rect width="12" height="7" fill="red"/></svg>'),100,100,1,{widthPx:9,heightPx:18});
	  const dimensions=getImageDimensions(Buffer.from(png).toString('base64'),'image/png');
	  if(dimensions.widthPx!==18 || dimensions.heightPx!==18) throw new Error('wrong SVG dimensions');
	  const changed=Promise.withResolvers();
	  const md=new Markdown('\\x60\\x60\\x60mermaid\\ngraph LR\\n A --> B\\n\\x60\\x60\\x60',0,0,getMarkdownTheme());
	  md.onChange=changed.resolve;
	  md.render(60);
	  await changed.promise;
	  const rows=md.render(60).join('\\n');
	  if(rows.includes('mermaid') || rows.includes('A --> B') || !rows.includes('A')) throw new Error('Mermaid did not replace fallback');
	  md.dispose();
	 } finally { closeMediaWorkers(); }
	 if('Bun' in globalThis) throw new Error('Bun leaked');
	`;
	const result=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:new URL('../..',import.meta.url),encoding:'utf8',timeout:30_000});
	assert.equal(result.status,0,result.stderr);
});
