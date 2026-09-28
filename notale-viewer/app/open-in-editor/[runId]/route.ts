import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { editorOrigins, editorRequest, openEditorDocument } from "../../../src/lib/editor-import";

/** One local Viewer process remembers the editor document for each generated version. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const input = editorRequest(runId, await request.json().catch(() => undefined));
  if (!input) return NextResponse.json({ message: "参数不对" }, { status: 400 });
  try {
    const origins = editorOrigins();
    const id = await openEditorDocument(runId, { ...origins, linksFile: path.join(process.cwd(), ".local", "editor-links.json") });
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
    const back = `${request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "")}://${host}/s/${input.session}`;
    const url = new URL(origins.publicEditor + "/");
    url.searchParams.set("document", id);
    url.searchParams.set("back", back);
    return NextResponse.json({ url: url.href });
  } catch (cause) {
    return NextResponse.json({ message: cause instanceof Error && cause.message !== "fetch failed" ? cause.message : "编辑器没有响应" }, { status: 502 });
  }
}
