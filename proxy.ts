import process from 'node:process';
import { Buffer } from 'buffer';
import { FetchMode, ServerSetting } from './src/types/types';
import type { Connect } from 'vite';
import { exec } from 'child_process';

type ProxyRequest = Parameters<Connect.SimpleHandleFunction>[0];
type ProxyResponse = Parameters<Connect.SimpleHandleFunction>[1];

const ignoredResponseHeaders = new Set([
  'content-encoding',
  'content-length',
  'connection',
  'transfer-encoding',
]);

const settings: ServerSetting = {
  CLIENT_HOST: 'http://localhost:3000',
  fetchMode: FetchMode.PROXY,
  disAllowedRequestHeaders: [
    'sec-ch-ua',
    'sec-ch-ua-mobile',
    'sec-ch-ua-platform',
    'sec-fetch-site',
    'origin',
    'sec-fetch-site',
    'sec-fetch-dest',
    'pragma',
    'if-none-match',
    'if-modified-since',
  ],
  disAllowResponseHeaders: ['link', 'set-cookie', 'set-cookie2'],
  useUserAgent: true,
};

const readRequestBody = (req: ProxyRequest) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

const appendHeader = (
  headers: Headers,
  name: string,
  value: string | string[] | undefined,
) => {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach(item => headers.append(name, item));
  } else {
    headers.set(name, value);
  }
};

const nativeFetchRequest = async (
  req: ProxyRequest,
  res: ProxyResponse,
  url: URL,
) => {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (['host', 'content-length', 'connection'].includes(name)) continue;
    appendHeader(headers, name, value);
  }

  const method = req.method ?? 'GET';
  const body =
    method === 'GET' || method === 'HEAD'
      ? undefined
      : new Uint8Array(await readRequestBody(req));
  const response = await fetch(url.href, {
    method,
    headers,
    body,
    redirect: 'follow',
  });

  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (
      !settings.disAllowResponseHeaders.includes(key) &&
      !ignoredResponseHeaders.has(key)
    ) {
      res.setHeader(key, value);
    }
  });

  if (method === 'HEAD' || response.status === 204 || response.status === 304) {
    res.end();
    return;
  }

  res.end(Buffer.from(await response.arrayBuffer()));
};

const proxySettingMiddleware: Connect.NextHandleFunction = (req, res) => {
  let str = '';
  req.on('data', chunk => {
    str += chunk;
  });
  req.on('end', () => {
    try {
      const newSettings = JSON.parse(str);
      for (const key in newSettings) {
        // @ts-ignore
        settings[key] = newSettings[key];
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.write(JSON.stringify(settings));
    } catch {
      res.statusCode = 400;
    } finally {
      res.end();
    }
  });
};

const proxyHandlerMiddle: Connect.NextHandleFunction = (req, res) => {
  const rawUrl = 'https:' + req.url;
  if (req.headers['access-control-request-method']) {
    res.setHeader(
      'access-control-allow-methods',
      req.headers['access-control-request-method'],
    );
    delete req.headers['access-control-request-method'];
  }
  if (req.headers['access-control-request-headers']) {
    res.setHeader(
      'access-control-allow-headers',
      req.headers['access-control-request-headers'],
    );
    delete req.headers['access-control-request-headers'];
  }
  res.setHeader(
    'Access-Control-Allow-Origin',
    req.headers.origin ?? settings.CLIENT_HOST,
  );
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  req.headers.referer = rawUrl;
  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
  } else {
    try {
      const _url = new URL(rawUrl);
      for (const _header in req.headers) {
        if (
          req.headers[_header]?.includes('localhost') ||
          settings.disAllowedRequestHeaders.includes(_header)
        ) {
          delete req.headers[_header];
        }
      }
      req.headers['sec-fetch-mode'] = 'cors';
      if (settings.cookies) {
        req.headers['cookie'] = settings.cookies;
      }
      if (!settings.useUserAgent) {
        delete req.headers['user-agent'];
      }
      req.headers.host = _url.host;
      req.url = _url.toString();
      res.statusCode = 200;
      proxyRequest(req, res);
    } catch (err) {
      console.log('\x1b[31m', '----------ERRROR----------');
      console.error(err);
      console.log('\x1b[31m', '----------ERRROR----------');
      if (!res.closed) {
        res.end();
      }
    }
  }
};

const proxyRequest: Connect.SimpleHandleFunction = (req, res) => {
  const _url = new URL(req.url || '');
  console.log('\x1b[36m', '----------------');
  console.log(
    `Making proxy request - at ${new Date().toLocaleTimeString()}
  url: ${_url.href}
  headers:`,
  );
  Object.entries(req.headers).forEach(([name, value]) => {
    console.log('\t', '\x1b[32m', name + ':', '\x1b[37m', value);
  });
  console.log('\x1b[36m', '----------------');
  if (settings.fetchMode === FetchMode.CURL) {
    //i mean if it works it works i guess, better than nothing
    let curl = `curl '${_url.href}'`;
    if (settings.useUserAgent) {
      curl += ` -H 'User-Agent: ${req.headers['user-agent']}'`;
    }
    if (settings.cookies) curl += ` -H 'Cookie: ${settings.cookies}'`;
    if (req.headers.origin2) curl += ` -H 'Origin: ${req.headers.origin2}'`;

    console.log('Running curl command:', curl);

    const isWindows = process.platform === 'win32';
    const options = isWindows
      ? {
          shell:
            process.env.BASH_LOCATION ||
            process.env.ProgramFiles + '\\git\\usr\\bin\\bash.exe',
        }
      : {};

    exec(curl, options, (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        res.statusCode = 500;
        res.write(`exec error: ${error}`);
        res.end();
        return;
      }
      if (stderr) {
        console.error(`stderr: ${stderr}`);
      }
      res.statusCode = 200;
      res.write(stdout);
      res.end();
    });
  } else {
    nativeFetchRequest(req, res, _url).catch(err => {
      console.error(err);
      res.statusCode = 500;
      res.end();
    });
  }
};

export { proxyHandlerMiddle, proxySettingMiddleware };
