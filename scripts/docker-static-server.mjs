import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const port = Number(process.env.PORT || 8080);
const distRoot = resolve(process.cwd(), 'dist');
const indexPath = join(distRoot, 'index.html');

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
]);

function resolveRequestPath(url) {
  const pathname = decodeURIComponent(new URL(url, `http://localhost:${port}`).pathname);
  const normalized = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const candidate = resolve(distRoot, `.${normalized}`);
  if (candidate !== distRoot && !candidate.startsWith(`${distRoot}${sep}`)) {
    return indexPath;
  }
  return candidate;
}

function sendFile(req, res, filePath) {
  const type = contentTypes.get(extname(filePath)) || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': filePath === indexPath ? 'no-store' : 'public, max-age=31536000, immutable',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
}

createServer((req, res) => {
  if (!req.url || !['GET', 'HEAD'].includes(req.method || '')) {
    res.writeHead(405).end();
    return;
  }

  const requestedPath = resolveRequestPath(req.url);
  const filePath =
    existsSync(requestedPath) && statSync(requestedPath).isFile()
      ? requestedPath
      : indexPath;

  if (!existsSync(filePath)) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Build output not found. Run npm run build before starting the server.');
    return;
  }

  sendFile(req, res, filePath);
}).listen(port, '0.0.0.0', () => {
  console.log(`Serving dist on http://0.0.0.0:${port}`);
});
