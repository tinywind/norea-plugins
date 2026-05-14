import 'cheerio';
import 'htmlparser2';
import 'dayjs';
import './index.css';

import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';

const { fetch: originalFetch } = window;

window.fetch = async (...args) => {
  const [resource, config] = args;
  const resourceUrl =
    resource instanceof Request ? resource.url : resource.toString();
  const url = new URL(resourceUrl, window.location.origin);
  if (url.origin === window.location.origin)
    return await originalFetch(resource, config);
  const _res = await originalFetch(`${window.location.origin}/${resourceUrl}`, {
    ...config,
    credentials: 'include',
    mode: 'cors',
  });
  Object.defineProperty(_res, 'url', {
    value: _res.url.startsWith(`${window.location.origin}/`)
      ? resourceUrl
      : _res.url,
  });
  return _res;
};

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
