import { createRoot } from "react-dom/client";
import "../../src/app/globals.css";
import { CrmLoadingScreen } from "../../src/components/crm/CrmLoadingScreen";

createRoot(document.getElementById("root")!).render(<CrmLoadingScreen error={new URLSearchParams(window.location.search).has("error") ? "Please try loading your workspace again." : null} onBack={() => window.location.assign("/crm/")} onRetry={() => window.location.assign(window.location.pathname)} />);
