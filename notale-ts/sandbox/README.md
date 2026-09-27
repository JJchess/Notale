# AI agent sandbox

The commands below build the two images and the internal network the
fix agent (src/fix) uses for its `bash` tool. See `src/fix/sandbox.ts`.

    docker build -t notale-agent-sandbox sandbox
    docker build -t notale-agent-proxy sandbox/proxy
    docker network create --internal notale-agent-net
    docker run -d --name notale-agent-proxy --restart unless-stopped --network notale-agent-net notale-agent-proxy
    docker network connect bridge notale-agent-proxy

Egress allowlist: `sandbox/proxy/filter`. The sandbox container has no route out except the proxy.
