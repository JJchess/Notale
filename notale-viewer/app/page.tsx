import { GenerationForm } from "../src/components/generation-form";
import { RecentRuns } from "../src/components/recent-runs";

export default function HomePage() {
  return (
    <main className="home-shell">
      <header className="brand"><span className="brand-mark">N</span><span>NOTALE</span></header>
      <section className="hero">
        <p className="kicker">LECTURE STUDIO</p>
        <h1>把一个主题，<br />变成一堂好课。</h1>
        <p className="lede">输入你想讲清楚的内容。生成过程、每页进展和讲义预览会保存在独立任务中。</p>
        <GenerationForm />
        <RecentRuns />
      </section>
      <footer>生成任务由独立的 Notale 服务持续运行，关闭页面不会终止任务。</footer>
    </main>
  );
}
