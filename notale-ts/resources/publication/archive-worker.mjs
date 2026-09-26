import { parentPort } from 'node:worker_threads';
import { zipSync } from 'fflate';

parentPort.once('message', files => {
  try {
    const data = zipSync(files, { level: 6 });
    parentPort.postMessage({ data }, [data.buffer]);
  } catch (error) { parentPort.postMessage({ error: String(error) }); }
});
