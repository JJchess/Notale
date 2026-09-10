"""Public Responses adapter for the observed outer Code-mode call surface."""

EXEC_DESCRIPTION = '''Run JavaScript as a fresh async cell. Use tools only through `tools`.
No Node, filesystem, network, console or imports are exposed in JavaScript.
Use shell commands for filesystem work. Supported helpers:
text(value), image(dataUrlOrViewResult), generatedImage(result), store(key,value),
load(key), setTimeout, clearTimeout, notify(value), yield_control(), exit().
Use `await` for tools. Independent calls may use Promise.allSettled.
The optional first line // @exec: {"yield_time_ms":1000,"max_output_tokens":2000}
controls yielding and text budget. If returned `Script running with cell ID ...`,
use outer wait(cell_id). A shell session_id belongs to tools.write_stdin, not wait.
Shell commands keep running between cells; JS locals do not. store/load retains JSON values.

tools.exec_command({cmd:string,workdir?:string,yield_time_ms?:number,max_output_tokens?:number,
shell?:string,login?:boolean,tty?:boolean}) returns {output,exit_code,session_id?,wall_time_seconds}.
The default workdir is the workspace; use workdir for another directory within it.
Only pipe sessions are supported. No approval/escalation tool is exposed.
tools.write_stdin({session_id:string,chars?:string,yield_time_ms?:number,max_output_tokens?:number})
polls or writes to a running shell process. Completed shells return an exit_code.
tools.view_image({path:string,detail?:"auto"|"low"|"high"|"original"}) returns {image_url,detail}.
Forward it with image(result) to inspect pixels. Paths must be inside the workspace;
use TMPDIR for temporary render files. SVG/PDF/EMF need rasterization before viewing.
Text output may be truncated; complete output remains in host logs. Prefer targeted reads.
'''

IMAGE_DESCRIPTION = '''
tools.image_gen__imagegen({prompt:string,referenced_image_paths?:string[],num_last_images_to_include?:number})
generates or edits raster assets through the configured image backend. Use paths when
all references have local files; otherwise select 1-5 recently viewed/generated images.
Never provide both mechanisms. Omit both for a new image. Returns {path,image_url,output_hint,generation_id}.
Use generatedImage(result) to inspect the generated image and then use the saved path.
The backend is a public Images API adapter, not the original private Codex image service.
'''


def tool_definitions(image_available):
    return [{'type': 'custom', 'name': 'exec', 'description': EXEC_DESCRIPTION+(
                IMAGE_DESCRIPTION if image_available else '\nImage generation is unavailable in this run; do not call it.'),
             'format': {'type': 'text'}},
            {'type': 'function', 'name': 'wait', 'description': 'Resume a yielded JavaScript exec cell; shell sessions use tools.write_stdin.',
             'parameters': {'type': 'object', 'properties': {
                 'cell_id': {'type': 'string'}, 'yield_time_ms': {'type': 'integer'},
                 'max_tokens': {'type': 'integer'}, 'terminate': {'type': 'boolean'}},
                 'required': ['cell_id'], 'additionalProperties': False}, 'strict': False}]


def tool_result(call, content):
    return {'type': 'custom_tool_call_output' if call['type'] == 'custom_tool_call' else 'function_call_output',
            'call_id': call['call_id'], 'output': content}
