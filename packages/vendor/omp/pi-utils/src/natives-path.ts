// cloud-pi-vendor: new file. Pure JavaScript Windows path shim for the removed pi-natives dependency.
// See PATCHES.md.
/**
 * Pure JavaScript stand-in for `@oh-my-pi/pi-natives/path`. Windows 8.3 short
 * name expansion needs the Win32 API; without the addon both helpers preserve
 * the input, which is also the native behavior on non-Windows hosts.
 */

export function expandWindowsLongPath(path: string): string {
	return path;
}

export function getWindowsShortPath(path: string): string {
	return path;
}
