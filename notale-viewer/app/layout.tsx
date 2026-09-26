import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Notale · 讲义生成",
  description: "创建讲义并查看实时生成进度",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
