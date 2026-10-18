import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, chown, readFile, writeFile, rm } from 'node:fs/promises';

const root = '/app';
const sandbox = 'notale-agent-sandbox:local';
const proxyImage = 'notale-agent-proxy:local';
const network = 'notale-agent-net';
const proxy = 'notale-agent-proxy';

function docker(args, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, {
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      env: process.env,
    });
    let output = '', errors = '';
    child.stdout?.on('data', data => { output += data; });
    child.stderr?.on('data', data => { errors += data; });
    child.once('error', reject);
    child.once('exit', code => code === 0
      ? resolve(output.trim())
      : reject(new Error(`docker ${args[0]} failed (${code})${capture ? ': ' + errors.trim() : ''}`)));
  });
}

for (const directory of [
  '/data/editor', '/data/editor/ai-sessions', '/data/editor/ai-uploads',
  '/data/viewer', '/data/generator', '/data/generator/runs',
  '/data/generator/sessions', '/data/generator/cache',
]) {
  await mkdir(directory, { recursive: true });
  await chown(directory, 1000, 1000);
}

// Builds run inside this installation's private engine. Its persistent image
// cache makes later starts quick; neither host images nor containers are touched.
await docker(['build', '-t', sandbox, `${root}/notale-ts/sandbox`]);
await docker(['build', '-t', proxyImage, `${root}/notale-ts/sandbox/proxy`]);
const networks = JSON.parse(await docker(['network', 'ls', '--format', 'json'], true)
  .then(text => '[' + text.split('\n').filter(Boolean).join(',') + ']'));
if (!networks.some(item => item.Name === network)) {
  await docker(['network', 'create', '--internal', network]);
}
const [info] = JSON.parse(await docker(['network', 'inspect', network], true));
if (!info.Internal) throw new Error('Agent network is not internal; refusing to start');

const ids = (await docker(['ps', '-aq', '--filter', `name=^/${proxy}$`], true)).split('\n').filter(Boolean);
const [image] = JSON.parse(await docker(['image', 'inspect', proxyImage], true));
let createProxy = true;
if (ids.length) {
  const [existing] = JSON.parse(await docker(['inspect', ids[0]], true));
  if (existing.Image !== image.Id) await docker(['rm', '-f', ids[0]]);
  else {
    if (!existing.NetworkSettings.Networks[network]) throw new Error('Existing proxy has unexpected networks');
    if (!existing.NetworkSettings.Networks.bridge) await docker(['network', 'connect', 'bridge', proxy]);
    await docker(['start', proxy]);
    createProxy = false;
  }
}
if (createProxy) {
  await docker(['run', '-d', '--name', proxy, '--restart', 'unless-stopped', '--network', network, proxyImage]);
  await docker(['network', 'connect', 'bridge', proxy]);
}

// The daemon resolves bind paths in its own filesystem. Exercise the exact
// shared /data mount, matching application UID and proxy DNS before any UI starts.
const probe = `/data/generator/.sandbox-check-${randomUUID()}`;
const token = randomUUID();
await mkdir(probe);
await chown(probe, 1000, 1000);
await writeFile(`${probe}/input`, token);
try {
  await docker(['run', '--rm', '--init', '--network', network, '--user', '1000:1000',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--read-only',
    '--cpus', '1', '--memory', '256m', '--pids-limit', '64', '--tmpfs', '/tmp:rw,size=16m',
    '-v', `${probe}:/workspace`, '-w', '/workspace', sandbox,
    'node', '--input-type=module', '-e', `
      import {readFile,writeFile} from 'node:fs/promises';
      import {connect} from 'node:net';
      if(process.getuid()!==1000) throw Error('Unexpected sandbox user');
      if(process.env.GEMINI_API_KEY || process.env.PARATERA_API_KEY || process.env.DOCKER_HOST) throw Error('Unexpected sandbox credentials');
      await writeFile('/workspace/output',await readFile('/workspace/input'));
      let connected=false;
      for(let attempt=0;attempt<20&&!connected;attempt++){
        connected=await new Promise(resolve=>{
          const socket=connect(8888,'notale-agent-proxy');
          const finish=value=>{socket.destroy();resolve(value)};
          socket.setTimeout(1000,()=>finish(false));
          socket.once('error',()=>finish(false));
          socket.once('connect',()=>finish(true));
        });
        if(!connected) await new Promise(resolve=>setTimeout(resolve,250));
      }
      if(!connected) throw Error('Agent proxy did not become ready');
    `]);
  if ((await readFile(`${probe}/output`, 'utf8')) !== token) throw new Error('Sandbox data mount does not match the application');
} finally {
  await rm(probe, { recursive: true, force: true });
}
console.log('Sandbox images, private network, proxy and shared workspace are ready.');
