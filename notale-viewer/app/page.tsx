import { GenerationForm } from "../src/components/generation-form";

export default function HomePage() {
  return (
    <main className="home-shell">
      <header className="brand"><span className="brand-mark">N</span><span>NOTALE</span></header>
      <section className="hero">
        <p className="kicker">LECTURE STUDIO</p>
        <GenerationForm />
      </section>
    </main>
  );
}
