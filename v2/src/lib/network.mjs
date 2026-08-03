import { fetch as undiciFetch, ProxyAgent } from 'undici';

const agents = new Map();

function proxyUrlFor(input) {
  const protocol = new URL(String(input)).protocol;
  if (protocol === 'https:') return process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || null;
  return process.env.HTTP_PROXY || process.env.http_proxy || null;
}

function allowProxyMitmTls() {
  return /^(?:1|true|yes)$/i.test(String(process.env.PROXY_TLS_ALLOW_MITM || ''));
}

function dispatcherFor(proxyUrl) {
  const allowMitm = allowProxyMitmTls();
  const key = `${proxyUrl}|mitm=${allowMitm}`;
  if (!agents.has(key)) {
    agents.set(key, new ProxyAgent(allowMitm
      ? { uri: proxyUrl, requestTls: { rejectUnauthorized: false }, proxyTls: { rejectUnauthorized: false } }
      : proxyUrl));
  }
  return agents.get(key);
}

export function proxyDescriptor(input) {
  const proxyUrl = proxyUrlFor(input);
  if (!proxyUrl) return { enabled: false };
  const parsed = new URL(proxyUrl);
  return {
    enabled: true,
    protocol: parsed.protocol,
    host: parsed.hostname,
    port: parsed.port || null,
    allowMitmTls: allowProxyMitmTls(),
  };
}

function retryableProxyHandshake(error) {
  return error?.cause?.code === 'ECONNRESET'
    && /before secure TLS connection was established/i.test(String(error?.cause?.message || ''));
}

export async function proxyAwareFetch(input, init = {}) {
  if (init.dispatcher) return undiciFetch(input, init);
  const proxyUrl = proxyUrlFor(input);
  if (!proxyUrl) return fetch(input, init);
  const request = { ...init, dispatcher: dispatcherFor(proxyUrl) };
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await undiciFetch(input, request);
    } catch (error) {
      if (attempt === 3 || !retryableProxyHandshake(error)) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 250));
    }
  }
  throw new Error('unreachable proxy fetch state');
}
