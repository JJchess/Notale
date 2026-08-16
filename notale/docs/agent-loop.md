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

Planner and Builder use the same `AgentLoop`. The one-shot Style stage and managed component calls use the
same transport and request/event contracts without inheriting Planner/Builder conversations or tool schemas.
`create_widget` performs focused plan/build calls; `create_code_runtime` performs one structured specification
call and compiles the executable UI deterministically. Component source never enters Builder history.

`inspect_page` is an ordinary tool inside the existing Builder conversation. It renders the current fragment
through the exact final slide document, global CSS, assets, and hydrated components in Chromium with a CDP
device viewport of 1280×720. The tool then makes exactly one isolated multimodal model call containing only a
short review protocol, the full run Style plus assigned composition and tokens, the current complete fragment,
and that screenshot. The call has no Builder profile, Builder history, prior screenshots, Planner task, or tool
schemas, and it does not run a geometry/overflow/console audit.

The isolated call returns structured `success` or `revise`. It may freely rewrite, reduce, or remove the draft's
content and UI while redesigning the page. On `revise`, `inspect_page` validates only the normal delivery
contract, writes the complete replacement atomically, increments the page revision, and returns only the new
revision to the Builder; the Builder must call `inspect_page` again. On `success`, the tool marks that exact
revision visually accepted and returns only compact status. Inspector-authored changes are capped at four per
page, while a later success-only review remains allowed. `submit_page` still terminates the outer Builder and
accepts only the exact accepted revision in a later Builder turn.

## Deliberately absent

There is no MCP, permission prompt, hook system, coordinator, subagent runtime, persistent conversation,
generic shell/file toolkit, generic image-message preprocessing, or automatic conversation compaction. The
inspection screenshot is consumed only by the isolated internal review request and is not replayed into the
outer Builder history. Resuming a run reuses terminal artifacts and restarts interrupted agents; it does not
resume an in-memory conversation.

The active Parallel Cloud model is accessed through its OpenAI-compatible Responses endpoint with
`store: false`. Notale can replay encrypted reasoning items when the provider supplies them. The transport also
retains Chat Completions compatibility for future providers. The SDK owns HTTP, SSE parsing, and bounded
retries; Notale owns message history, tool execution, terminal conditions, logging, and artifacts.

## Request trace

Each `llm-requests/<agent>/turn-N.json` contains the complete request body passed to the SDK plus its call ID.
The corresponding `llm.call.started` event stores the relative path, SHA-256, byte count, and local write time.
API keys and authorization headers are never part of the snapshot.
