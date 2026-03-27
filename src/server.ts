import http from 'node:http';
import path from 'node:path';
import { promises as fs } from 'node:fs';

const rootDir = process.cwd();
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4173);
const databasePath = path.join(rootDir, 'data', 'database.json');

const mimeTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function sendJson(response: http.ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendText(response: http.ServerResponse, statusCode: number, payload: string): void {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(payload);
}

async function readBody(request: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      raw += chunk;
    });
    request.on('end', () => resolve(raw));
    request.on('error', reject);
  });
}

function isValidDatabaseShape(payload: unknown): boolean {
  return Boolean(
    payload &&
      typeof payload === 'object' &&
      Array.isArray((payload as { categories?: unknown[] }).categories) &&
      Array.isArray((payload as { products?: unknown[] }).products),
  );
}

async function serveStatic(requestPath: string, response: http.ServerResponse): Promise<void> {
  const pathname = requestPath === '/' ? '/index.html' : requestPath;
  const safePath = path.resolve(rootDir, `.${pathname}`);

  if (!safePath.startsWith(rootDir)) {
    sendText(response, 403, 'Forbidden');
    return;
  }

  try {
    const stats = await fs.stat(safePath);
    const finalPath = stats.isDirectory() ? path.join(safePath, 'index.html') : safePath;
    const content = await fs.readFile(finalPath);
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(finalPath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(content);
  } catch {
    sendText(response, 404, 'Not Found');
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${host}:${port}`);
  const method = request.method || 'GET';

  try {
    if (url.pathname === '/api/health') {
      sendJson(response, 200, { ok: true, mode: 'json-file-server' });
      return;
    }

    if (url.pathname === '/api/database') {
      if (method === 'GET') {
        const raw = stripBom(await fs.readFile(databasePath, 'utf8'));
        response.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        response.end(raw);
        return;
      }

      if (method === 'PUT') {
        const rawBody = stripBom(await readBody(request));
        let parsed: unknown;

        try {
          parsed = JSON.parse(rawBody);
        } catch {
          sendJson(response, 400, { error: 'Invalid JSON payload.' });
          return;
        }

        if (!isValidDatabaseShape(parsed)) {
          sendJson(response, 400, { error: 'Invalid database payload.' });
          return;
        }

        await fs.writeFile(databasePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
        sendJson(response, 200, { ok: true, updatedAt: new Date().toISOString() });
        return;
      }

      response.setHeader('Allow', 'GET, PUT');
      sendText(response, 405, 'Method Not Allowed');
      return;
    }

    await serveStatic(url.pathname, response);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : 'Internal Server Error',
    });
  }
});

server.listen(port, host, () => {
  console.log(`Air guide server listening on http://${host}:${port}`);
});