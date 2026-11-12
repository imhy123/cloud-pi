// cloud-pi-catalog: new file. Per-worker HOME/XDG isolation so catalog tests never write the real cloud-pi config root.
// See PATCHES.md.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

// Every worker gets an isolated home and config root so imports and cache
// tests never touch the real ~/.cloud-pi. `PI_TEST_RUNTIME` also routes the
// shared logger to the OS temp directory.
const home = mkdtempSync(path.join(tmpdir(), "cloud-pi-catalog-home-"));
process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.PI_CODING_AGENT_DIR = path.join(home, "agent");
process.env.XDG_DATA_HOME = path.join(home, "data");
process.env.XDG_STATE_HOME = path.join(home, "state");
process.env.XDG_CACHE_HOME = path.join(home, "cache");
process.env.XDG_CONFIG_HOME = path.join(home, "config");
process.env.PI_TEST_RUNTIME = "1";

process.on("exit", () => rmSync(home, { recursive: true, force: true }));
