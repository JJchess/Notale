export const defaultTheme = {
    background: "#f3efe7", surface: "#e5dfd4", foreground: "#17201c",
    muted: "#68706b", accent: "#a84b32", border: "#c4c9c3",
    success: "#27724e", warning: "#a76b22", error: "#aa382d",
};
export function monacoTheme(theme) {
    const dark = luminance(theme.background) < 0.35;
    return {
        base: dark ? "vs-dark" : "vs",
        inherit: true,
        colors: {
            "editor.background": theme.surface,
            "editor.foreground": theme.foreground,
            "editorLineNumber.foreground": theme.muted,
            "editorLineNumber.activeForeground": theme.accent,
            "editorCursor.foreground": theme.accent,
            "editor.selectionBackground": `${theme.accent}33`,
            "editor.lineHighlightBackground": `${theme.accent}0D`,
            "editorIndentGuide.background1": theme.border,
            "editorIndentGuide.activeBackground1": theme.muted,
        },
        rules: [
            { token: "comment", foreground: hex(theme.muted), fontStyle: "italic" },
            { token: "keyword", foreground: hex(theme.accent) },
            { token: "number", foreground: hex(theme.warning) },
            { token: "string", foreground: hex(theme.success) },
            { token: "invalid", foreground: hex(theme.error) },
        ],
    };
}
function hex(value) { return value.replace(/^#/, "").slice(0, 6); }
function luminance(value) {
    const raw = hex(value);
    if (!/^[0-9a-f]{6}$/i.test(raw))
        return 1;
    const channels = [0, 2, 4].map((offset) => parseInt(raw.slice(offset, offset + 2), 16) / 255).map((channel) => channel <= .03928 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
    return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
}
//# sourceMappingURL=theme.js.map