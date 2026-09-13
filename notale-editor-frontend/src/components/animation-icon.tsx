import type { ReactNode } from "react";
const paths: Record<string, ReactNode> = {
  play: <path d="m8 4 12 8-12 8Z" />,
  stop: <rect x="5" y="5" width="14" height="14" rx="1" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V4H4v12h4" />
    </>
  ),
  trash: <path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" />,
  up: <path d="m5 14 7-7 7 7" />,
  down: <path d="m5 10 7 7 7-7" />,
  grip: <path d="M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01" />,
};
export function AnimationIcon({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      width="16"
      height="16"
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
