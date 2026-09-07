// Fold the whole game into one self-contained HTML file.
//
// The game ships as 22 plain ES modules plus a stylesheet and three woff2
// faces, which is the right shape for a repo and the wrong shape for
// handing someone a link. There is no bundler in this project and there is
// not going to be one, so this is the smallest thing that works: a module
// registry, and a targeted rewrite of the four export forms and two import
// forms the codebase actually uses (surveyed, not assumed — no `export *`,
// no re-exports, no aliased named imports, and no import cycles).
//
// Everything ends up inline. Nothing is fetched at runtime, which also
// means it survives a strict script-src that would block data: URLs.
//
//   node bundle.mjs [outfile]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const OUT = process.argv[2] || path.join(ROOT, 'dist', 'dont-touch-it.html');

// ---- collect every module, entry first ----------------------------------
const idOf = (abs) => path.relative(SRC, abs).split(path.sep).join('/');
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) files.push(p);
  }
})(SRC);

// ---- dependency order (no cycles; asserted below) -----------------------
const deps = new Map();
const source = new Map();
for (const f of files) {
  const id = idOf(f);
  const text = fs.readFileSync(f, 'utf8');
  source.set(id, text);
  const d = new Set();
  for (const m of text.matchAll(/from\s+'([^']+)'/g)) {
    if (!m[1].startsWith('.')) continue;
    d.add(path.posix.normalize(path.posix.join(path.posix.dirname(id), m[1])));
  }
  // the one dynamic import: the chapter registry
  for (const m of text.matchAll(/'(\.\/l[0-9][^']*\.js)'/g)) {
    d.add(path.posix.normalize(path.posix.join(path.posix.dirname(id), m[1])));
  }
  deps.set(id, [...d]);
}
const order = [];
const state = new Map();
const visit = (id, chain = []) => {
  if (state.get(id) === 2) return;
  if (state.get(id) === 1) throw new Error(`import cycle: ${[...chain, id].join(' -> ')}`);
  state.set(id, 1);
  for (const d of deps.get(id) || []) if (source.has(d)) visit(d, [...chain, id]);
  state.set(id, 2);
  order.push(id);
};
for (const id of source.keys()) visit(id);

// ---- rewrite one module into a registry factory -------------------------
function factory(id, text) {
  const dir = path.posix.dirname(id);
  const resolve = (spec) => path.posix.normalize(path.posix.join(dir, spec));
  const named = new Set();
  let s = text;

  // import { a, b } from './x.js'   (possibly spanning lines)
  s = s.replace(/import\s*\{([\s\S]*?)\}\s*from\s*'([^']+)';?/g, (_, names, spec) => {
    const body = names.split(',').map(n => n.trim()).filter(Boolean)
      .map(n => { const m = n.match(/^(\S+)\s+as\s+(\S+)$/); return m ? `${m[1]}: ${m[2]}` : n; })
      .join(', ');
    return `const { ${body} } = __req(${JSON.stringify(resolve(spec))});`;
  });
  // import D from './x.js'
  s = s.replace(/import\s+([A-Za-z_$][\w$]*)\s+from\s*'([^']+)';?/g,
    (_, d, spec) => `const ${d} = __req(${JSON.stringify(resolve(spec))}).default;`);

  // export forms — all four the codebase uses
  s = s.replace(/^export\s+default\s+([^;]+);/gm, (_, v) => `__ex.default = ${v};`);
  s = s.replace(/^export\s+(async\s+function|function|class|const|let)\s+([A-Za-z_$][\w$]*)/gm,
    (_, kind, name) => { named.add(name); return `${kind} ${name}`; });

  // the chapter registry's dynamic import, resolved through the registry
  s = s.replace(/await\s+import\(path\)/g, 'await Promise.resolve(__req(path))');
  if (id === 'game/levels/index.js') {
    s = s.replace(/'(\.\/l[0-9][^']*\.js)'/g, (_, spec) => JSON.stringify(resolve(spec)));
  }

  for (const n of named) s += `\n__ex.${n} = ${n};`;

  // Top-level await is legal in a module and illegal in the plain function
  // a module becomes here. Only the entry uses it (`await loadLevels()`),
  // and nothing imports the entry, so that one runs as an async body — its
  // exports would resolve late, which for a module with none is free.
  const tla = /^(?:const|let|var)\s[^\n]*=\s*await\s|^await\s/m.test(s);
  const body = tla ? `return (async () => {\n${s}\n})();` : s;
  return `__def(${JSON.stringify(id)}, function (__ex, __req) {\n${body}\n});`;
}

// ---- inline the stylesheet and its faces --------------------------------
let css = fs.readFileSync(path.join(SRC, 'ui', 'style.css'), 'utf8');
css = css.replace(/url\('([^']+\.woff2)'\)/g, (_, rel) => {
  const p = path.resolve(path.join(SRC, 'ui'), rel);
  const b64 = fs.readFileSync(p).toString('base64');
  return `url('data:font/woff2;base64,${b64}')`;
});

// ---- emit ---------------------------------------------------------------
// Artifact-hosted pages are wrapped in their own doctype/head/body, so this
// is content only. It also opens in a plain browser as-is.
const html = `<title>DON'T TOUCH IT</title>
<style>
${css}
/* The host page supplies the viewport meta, so pinch-zoom is not disabled
   for us the way the standalone build disables it. Two-finger gestures are
   a mechanic here — Chapter II is squeezed and Chapter III is broken with
   two fingers — so the stage has to claim its own touches. */
html, body { margin: 0; padding: 0; background: #0a0a0c; overscroll-behavior: none; }
#stage, #world { touch-action: none; -webkit-user-select: none; user-select: none; }
</style>
<div id="stage">
  <canvas id="world" aria-label="Game" role="img"></canvas>
  <div id="overlay" aria-live="polite"></div>
</div>
<script type="module">
const __mods = {}, __defs = {};
function __def(id, fn) { __defs[id] = fn; }
function __req(id) {
  if (__mods[id]) return __mods[id];
  const ex = {};
  __mods[id] = ex;
  const fn = __defs[id];
  if (!fn) throw new Error('module not bundled: ' + id);
  fn(ex, __req);
  return ex;
}
${order.map(id => factory(id, source.get(id))).join('\n')}
__req('main.js');
</script>
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`${order.length} modules -> ${OUT}  (${(html.length / 1024).toFixed(0)} KB)`);
