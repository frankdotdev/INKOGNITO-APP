#!/usr/bin/env node
// Usage: node run-e2e.mjs <random|media|ai|billing>
// Copies the Worker to a temp folder, installs, typechecks, starts the stand-in servers and `wrangler dev`, runs e2e.mjs, cleans up.
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const name = process.argv[2]; if (!name) { console.error('usage: run-e2e.mjs <worker>'); process.exit(2); }
const src = join(dirname(fileURLToPath(import.meta.url)), name), cfg = JSON.parse(readFileSync(join(src, 'e2e.config.json'), 'utf8'));
const tmp = mkdtempSync(join(tmpdir(), `ink-${name}-`)); const kids = [];
const done = code => { kids.forEach(k => { try { k.kill('SIGTERM'); } catch {} }); spawnSync('pkill', ['-x', 'workerd']); try { rmSync(tmp, { recursive: true, force: true }); } catch {} process.exit(code); };
cpSync(src, tmp, { recursive: true, filter: p => !/node_modules|\.wrangler/.test(p) });
const run = (cmd, args) => spawnSync(cmd, args, { cwd: tmp, stdio: 'inherit' });
console.log(`[${name}] installing`); if (run('npm', ['install', '--no-audit', '--no-fund', '--silent']).status !== 0) done(1);
console.log(`[${name}] typechecking`); if (run('npx', ['tsc', '--noEmit']).status !== 0) done(1);
writeFileSync(join(tmp, '.dev.vars'), Object.entries(cfg.secrets).map(([k, v]) => `${k}=${v === '$RANDOM_B64_32' ? randomBytes(32).toString('base64') : v}`).join('\n') + '\n');
kids.push(spawn('node', [cfg.fake], { cwd: tmp, stdio: 'ignore' }));
const args = ['wrangler', 'dev', '--local', '--port', String(cfg.port), ...(cfg.flags ?? [])]; for (const [k, v] of Object.entries(cfg.vars)) args.push('--var', `${k}:${v}`);
kids.push(spawn('npx', args, { cwd: tmp, stdio: 'ignore' }));
let up = false; for (let i = 0; i < 60 && !up; i++) { await new Promise(r => setTimeout(r, 1500)); up = await fetch(`http://localhost:${cfg.port}/health`).then(r => r.ok, () => false); }
if (!up) { console.error(`[${name}] Worker did not start`); done(1); }
console.log(`[${name}] running e2e`); done(run('node', ['e2e.mjs']).status ?? 1);
