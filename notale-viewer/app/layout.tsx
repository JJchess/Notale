import type { Metadata } from "next";
import "./styles.css";
import { Sidebar } from "../src/components/sidebar";

export const metadata: Metadata = {
  title: "Notale · 讲义生成",
  description: "创建讲义并查看实时生成进度",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><div className="app-frame"><Sidebar /><div className="app-main">{children}</div></div></body></html>;
}
