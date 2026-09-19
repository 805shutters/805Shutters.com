import { createRoot } from "react-dom/client";
import "../../src/app/globals.css";
import { CrmLoadingScreen } from "../../src/components/crm/CrmLoadingScreen";

createRoot(document.getElementById("root")!).render(<CrmLoadingScreen />);
