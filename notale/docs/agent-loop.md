# Notale AgentLoop

Notale owns one focused model/tool loop. Its streaming and message conversion behavior was pruned from
[OpenHarness v0.1.9](https://github.com/HKUDS/OpenHarness/tree/v0.1.9), commit
`a0f8552c69d0b25d613af288823212a8b6b59a`, under the MIT license preserved in
`LICENSES/OpenHarness-MIT.txt`.

## Runtime boundary

For each Planner or Builder, `agents/loop.py`:

1. sends the role prompt, assigned Skill text, task, and selected tool schemas through the OpenAI SDK;
2. assembles streamed text, reasoning, and tool-call argument fragments;
3. validates tool input with the tool's Pydantic model and executes only registered Notale tools;
4. returns tool results to the same conversation until a terminal tool accepts an artifact;
5. enforces turn and duration limits while emitting the existing run events and token usage;
6. saves the exact request body for every model turn under `llm-requests/`.

Planner and Builder use the same `AgentLoop`. Profiles, Skills, Tools, the deterministic Planner-to-Builder
workflow, and artifact validation remain separate Notale concerns.

The root Planner is intentionally a two-turn protocol: its run-scoped `style` tool creates and validates a
concrete Builder Skill, then `plan` may terminate only on a later model turn. The loop serializes these two
tool names if a model emits both together, so a plan can never bypass the accepted style result.

## Deliberately absent

There is no MCP, permission prompt, hook system, coordinator, subagent runtime, persistent conversation,
generic shell/file toolkit, image-message preprocessing, or automatic conversation compaction. Resuming a
run reuses terminal artifacts and restarts interrupted agents; it does not resume an in-memory conversation.

OpenRouter is accessed through its OpenAI-compatible Chat Completions endpoint. The SDK owns HTTP, SSE parsing,
and bounded retries; Notale owns message history, tool execution, terminal conditions, logging, and artifacts.

## Request trace

Each `llm-requests/<agent>/turn-N.json` contains the complete request body passed to the SDK plus its call ID.
The corresponding `llm.call.started` event stores the relative path, SHA-256, byte count, and local write time.
API keys and authorization headers are never part of the snapshot.
