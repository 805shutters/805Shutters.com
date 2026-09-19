import styles from "./CrmLoadingScreen.module.css";

export function CrmLoadingScreen() {
  return (
    <div className={`crm-app-shell ${styles.screen}`}>
      <section className={styles.card} role="status" aria-live="polite" aria-busy="true">
        <img className={styles.brand} src="/brand/805-shutters-logo-exact-transparent.png" alt="805 Shutters" width={286} height={270} />
        <div className={styles.indicator} aria-hidden="true" />
        <h1 className={styles.title}>Opening your workspace</h1>
        <p className={styles.description}>Loading CRM…</p>
      </section>
    </div>
  );
}
