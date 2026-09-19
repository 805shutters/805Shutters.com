import styles from "./CrmLoadingScreen.module.css";

export function CrmLoadingScreen() {
  return (
    <div className={`crm-app-shell ${styles.screen}`}>
      <section className={styles.content} role="status" aria-live="polite" aria-busy="true">
        <div className={styles.logoFrame}>
          <div className={styles.indicator} aria-hidden="true" />
          <img className={styles.brand} src="/brand/805-shutters-logo-exact-transparent.png" alt="805 Shutters" width={286} height={270} />
        </div>
        <h1 className={styles.title}>Welcome to 805.</h1>
        <p className={styles.description}>Opening your workspace…</p>
      </section>
      <p className={styles.footer}>Shutters · Shades · Blinds</p>
    </div>
  );
}
