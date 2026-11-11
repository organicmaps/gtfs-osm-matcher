import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const directory = await mkdtemp(join(tmpdir(), 'osm-tests-'));
try {
    const outfile = join(directory, 'tests.mjs');
    await build({
        entryPoints: ['tests/osm-export.test.ts'],
        bundle: true, platform: 'node', format: 'esm', outfile,
        define: { 'import.meta.env.DEV': 'false' },
    });
    process.exitCode = spawnSync(process.execPath, [outfile], { stdio: 'inherit' }).status ?? 1;
} finally {
    await rm(directory, { recursive: true, force: true });
}
