import type { Metadata } from "next";
import "./styles.css";
import { LocaleProvider } from "../src/components/locale";
import { Sidebar } from "../src/components/sidebar";

export const metadata: Metadata = {
  title: "Notale · Interactive lectures",
  description: "Turn knowledge into interactive lectures. Create, refine and present with Notale.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><LocaleProvider><div className="app-frame"><Sidebar /><div className="app-main">{children}</div></div></LocaleProvider></body></html>;
}
