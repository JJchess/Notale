"""Observed tool declarations, including Codex's Responses Lite additional_tools."""
import re

IMAGE_NAMES = {"image_generation", "imagegen", "image_gen", "generate_image", "imagegen__imagegen", "image_gen__imagegen"}
DECLARATION = re.compile(r"declare\s+const\s+tools\s*:\s*\{\s*([A-Za-z0-9_]+)\s*\(")


def tool_declarations(request):
    names = set()
    def visit(tools, prefix=""):
        for tool in tools if isinstance(tools, list) else []:
            if not isinstance(tool, dict):
                continue
            name = tool.get("name") or tool.get("function", {}).get("name") or tool.get("type")
            if name:
                names.add(prefix + name)
            if tool.get("type") == "namespace":
                visit(tool.get("tools"), prefix + str(name) + ".")
            # Code-mode executable tool declarations live in the exec description.
            names.update(DECLARATION.findall(tool.get("description", "")))
    if isinstance(request, dict):
        visit(request.get("tools"))
        for item in request.get("input", []):
            if isinstance(item, dict) and item.get("type") == "additional_tools":
                visit(item.get("tools"))
    return names


def summarize(names):
    image_names = sorted(name for name in names if name.split(".")[-1] in IMAGE_NAMES)
    return {"tool_declarations": sorted(names), "image_generation": {
        "status": "advertised" if image_names else "not_observed",
        "tool_names": image_names,
        "note": "Declaration evidence only; skill text is not a callable tool, and success requires actual invocation evidence."}}
