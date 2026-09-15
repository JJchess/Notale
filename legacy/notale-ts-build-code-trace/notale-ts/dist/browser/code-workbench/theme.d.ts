import type * as Monaco from "monaco-editor";
import type { LectureTheme } from "../../protocol/index.js";
export declare const defaultTheme: LectureTheme;
export declare function monacoTheme(theme: LectureTheme): Monaco.editor.IStandaloneThemeData;
