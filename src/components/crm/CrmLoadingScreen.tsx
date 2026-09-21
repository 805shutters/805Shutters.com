import styles from "./CrmLoadingScreen.module.css";

type CrmLoadingScreenProps = {
  error?: string | null;
  onRetry?: () => void;
  onBack?: () => void;
};

export function CrmLoadingScreen({ error, onRetry, onBack }: CrmLoadingScreenProps = {}) {
  return (
    <div className={`crm-app-shell ${styles.screen}`}>
      <section className={styles.content} aria-label="805 workspace">
        <div className={styles.logoFrame}>
          <div className={`${styles.indicator} ${error ? styles.stopped : ""}`} aria-hidden="true" />
          <img className={styles.brand} src="/brand/805-shutters-logo-exact-transparent.png" alt="805 Shutters" width={286} height={270} />
        </div>
        <div role={error ? "alert" : "status"} aria-live={error ? "assertive" : "polite"}>
          <h1 className={styles.title}>{error ? "Jobs could not be loaded." : "Loading workspace…"}</h1>
          <p className={styles.description}>{error || "Your jobs will appear shortly."}</p>
        </div>
        {onBack || (error && onRetry) ? (
          <div className={styles.actions}>
            {error && onRetry ? <button type="button" className={styles.retry} onClick={onRetry}>Retry</button> : null}
            {onBack ? (
              <button type="button" className={styles.back} onClick={onBack}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7" /></svg>
                Back to active jobs
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
