import styles from "./CrmLoadingScreen.module.css";

export function CrmLoadingScreen() {
  return (
    <div className={`crm-app-shell ${styles.screen}`}>
      <section className={styles.card} role="status" aria-live="polite" aria-busy="true">
        <div className={styles.brand}>805 <span>SHUTTERS</span></div>
        <div className={styles.indicator} aria-hidden="true" />
        <h1 className={styles.title}>Opening your workspace</h1>
        <p className={styles.description}>Loading CRM…</p>
      </section>
    </div>
  );
}
