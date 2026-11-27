import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs';
import { extname, join, sep } from 'node:path';

// The local copy of the CDN (a symlink to the data pipeline's output, ignored
// by git), served at /cdn-local by the dev and preview servers the way GitHub
// Pages serves the real one: files as they are on disk, never compressed on
// the fly, and HTTP range requests answered with 206 — the PMTiles archives
// (up to 65 MB) are only ever read that way, a few kilobytes at a time.
const LOCAL = '.cdn-local';
const ROUTE = '/cdn-local';
const TYPES = { '.json': 'application/json', '.pmtiles': 'application/vnd.pmtiles' };

function localCdn() {
  const serve = (req, res, next) => {
    if (!existsSync(LOCAL)) return next();
    const root = realpathSync(LOCAL);
    const file = join(root, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {
      res.statusCode = 404;
      return res.end();
    }
    const size = statSync(file).size;
    res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-cache');
    let start = 0;
    let end = size - 1;
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (req.headers.range) {
      // One range, "a-b", "a-" or "-n" (the last n bytes); anything else is refused.
      if (!range || (range[1] === '' && range[2] === '')) {
        res.statusCode = 416;
        res.setHeader('Content-Range', `bytes */${size}`);
        return res.end();
      }
      if (range[1] === '') start = Math.max(0, size - Number(range[2]));
      else {
        start = Number(range[1]);
        if (range[2] !== '') end = Math.min(end, Number(range[2]));
      }
      if (start > end || start >= size) {
        res.statusCode = 416;
        res.setHeader('Content-Range', `bytes */${size}`);
        return res.end();
      }
      res.statusCode = 206;
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    }
    res.setHeader('Content-Length', end - start + 1);
    if (req.method === 'HEAD') return res.end();
    createReadStream(file, { start, end }).pipe(res);
  };
  return {
    name: 'local-cdn',
    // Block bodies: a function returned from these hooks would run as a post hook.
    configureServer(server) {
      server.middlewares.use(ROUTE, serve);
    },
    configurePreviewServer(server) {
      server.middlewares.use(ROUTE, serve);
    },
  };
}

export default defineConfig(({ command }) => {
  // `pnpm dev` reads the local copy when there is one, without any setting.
  if (command === 'serve' && !process.env.VITE_CDN && existsSync(LOCAL)) process.env.VITE_CDN = ROUTE;
  return {
    // GitHub Pages serves the project at /barycadabra/, the dev server at the root.
    base: process.env.NODE_ENV === 'production' ? '/barycadabra/' : '/',
    publicDir: 'public',
    plugins: [tailwindcss(), localCdn()],
    server: { port: 3000, open: true },
  };
});
