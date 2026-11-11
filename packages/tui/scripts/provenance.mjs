import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, relative, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sources = resolve(root, 'src');
const write = process.argv.includes('--write');
const upstream = resolve(process.env.OH_MY_PI_DIR ?? join(root, '../../../oh-my-pi'));
const pi = resolve(process.env.PI_DIR ?? join(root, '../../../pi'));
const commit = 'e325ffc73ab86e03bdd20a91b77d8e2b3964c906';
const piCommit = execFileSync('git', ['-C', pi, 'rev-parse', '2a32a605a9'], { encoding: 'utf8' }).trim();
function splitHeader(text) {
	if (!text.startsWith('// cloud-pi-tui:')) return ['', text];
	const end = text.indexOf('// See PATCHES.md.\n');
	if (end < 0) throw new Error('Missing provenance header terminator');
	const length = end + '// See PATCHES.md.\n'.length;
	return [text.slice(0, length), text.slice(length)];
}
function files(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]); }
const manifest = [];
for (const filename of files(sources).sort()) {
	const file = relative(sources, filename).replaceAll('\\', '/');
	let [header, body] = splitHeader(readFileSync(filename, 'utf8'));
	let origin = 'oh-my-pi';
	let source = file.startsWith('vendor/pi-utils/') ? 'packages/utils/src/' + file.slice(16) : file === 'vendor/package.json' ? 'packages/utils/package.json' : 'packages/tui/src/' + file;
	let revision = commit;
	if (file === 'compat/text.ts' || file === 'compat/keys-engine.ts') { origin = 'pi'; source = 'packages/tui/src/' + (file === 'compat/text.ts' ? 'utils.ts' : 'keys.ts'); revision = piCommit; }
	else if (file.startsWith('compat/') || /new file\./.test(header)) origin = 'new';
	let original;
	if (origin !== 'new') original = execFileSync('git', ['-C', origin === 'pi' ? pi : upstream, 'show', `${revision}:${source}`], { encoding: 'utf8' });
	const kind = origin === 'new' ? 'new' : original === body ? 'verbatim' : 'adapted';
	const expected = JSON.parse(readFileSync(resolve(root, 'SOURCES.json'), 'utf8')).files.find(entry => entry.file === file);
	if (write) {
		if (!file.endsWith('.json')) {
			let note = expected?.changes ?? 'Node.js adaptation; see the per-file modification log.';
			if (kind === 'new') header = `// cloud-pi-tui: new file. ${note}\n// See PATCHES.md.\n`;
			else header = `// cloud-pi-tui: ${kind} copy of ${origin} ${source}\n// (commit ${revision.slice(0, 12)}${origin === 'oh-my-pi' ? '; v18.18.7' : ''}).${kind === 'adapted' ? ' ' + note : ''}\n// See PATCHES.md.\n`;
			writeFileSync(filename, header + body);
		}
	} else {
		if (!expected || expected.kind !== kind || expected.origin !== origin || expected.commit !== (origin === 'new' ? null : revision) || expected.source !== (origin === 'new' ? null : source)) throw new Error(`${file}: stale source inventory`);
		if (!file.endsWith('.json') && (!header.includes(kind === 'new' ? 'new file.' : `${kind} copy of ${origin} ${source}`) || (origin !== 'new' && !header.includes(revision.slice(0, 12))))) throw new Error(`${file}: invalid provenance header`);
	}
	const hash = original === undefined ? null : createHash('sha256').update(original).digest('hex');
	if (!write && expected.upstreamSha256 !== hash) throw new Error(`${file}: upstream hash changed`);
	manifest.push({ file, kind, origin, source: origin === 'new' ? null : source, commit: origin === 'new' ? null : revision, upstreamSha256: hash, ...(kind !== 'verbatim' ? { changes: expected?.changes ?? 'Node.js adaptation; see PATCHES.md.' } : {}) });
}
if (write) writeFileSync(resolve(root, 'SOURCES.json'), JSON.stringify({ upstreamTag: 'v18.18.7', files: manifest }, null, '\t') + '\n');
else if (JSON.parse(readFileSync(resolve(root, 'SOURCES.json'), 'utf8')).files.length !== manifest.length) throw new Error('Source inventory file count differs');
console.log(`Checked ${manifest.length} source files against v18.18.7 and pi; ${manifest.filter(e => e.kind === 'verbatim').length} verbatim.`);
