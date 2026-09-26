import type { ReactNode } from "react";
const paths: Record<string, ReactNode> = {
  bold: <path d="M7 4h6a4 4 0 0 1 0 8H7zm0 8h7a4 4 0 0 1 0 8H7z" />,
  italic: <path d="M10 4h9M5 20h9M15 4 9 20" />,
  underline: <path d="M6 3v7a6 6 0 0 0 12 0V3M4 21h16" />,
  strikeThrough: (
    <path d="M17 5c-2-3-10-2-10 2 0 2 2 3 5 4m-9 1h18m-4 3c2 5-7 8-11 3" />
  ),
  insertUnorderedList: (
    <>
      <path d="M9 5h12M9 12h12M9 19h12" />
      <circle cx="3" cy="5" r="1" />
      <circle cx="3" cy="12" r="1" />
      <circle cx="3" cy="19" r="1" />
    </>
  ),
  insertOrderedList: (
    <path d="M10 5h11M10 12h11M10 19h11M2 3h2v5M2 8h4M2 13c0-3 5-3 4 0l-4 5h4" />
  ),
  indent: <path d="M3 4h18M11 9h10M11 15h10M3 20h18M3 9l4 3-4 3" />,
  outdent: <path d="M3 4h18M11 9h10M11 15h10M3 20h18M7 9l-4 3 4 3" />,
  justifyLeft: <path d="M3 4h18M3 9h12M3 15h18M3 20h12" />,
  justifyRight: <path d="M3 4h18M9 9h12M3 15h18M9 20h12" />,
  justifyFull: <path d="M3 4h18M3 9h18M3 15h18M3 20h18" />,
  justifyCenter: <path d="M3 4h18M6 9h12M3 15h18M6 20h12" />,
};
export function TextFormatIcon({ name }: { name: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
