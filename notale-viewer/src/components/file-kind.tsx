/** A file's type as its extension, in place of an icon: real information, and never an emoji. */
export function FileKind({ name }: { name: string }) {
  const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toUpperCase() ?? "FILE";
  return <span className="file-kind" aria-hidden="true">{extension === "JPEG" ? "JPG" : extension}</span>;
}
