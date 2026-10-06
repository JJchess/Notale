import { HomeComposer } from "../home-composer";
import styles from "./start.module.css";

export function StartScreen() {
  return <main className={styles.home}>
    <div className={styles.content}>
      <h1 className={styles.brand}>
        <img src="/brand/notale-lockup.svg" alt="Notale" width={180} height={35} />
      </h1>
      <HomeComposer />
    </div>
  </main>;
}
