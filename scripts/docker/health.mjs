const url = process.env.NOTALE_HEALTH_URL;
if (!url) throw new Error('NOTALE_HEALTH_URL is required');
try {
  const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
} catch (error) {
  console.error(`Not ready: ${url}: ${error.message}`);
  process.exitCode = 1;
}
