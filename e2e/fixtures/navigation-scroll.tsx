import { useState } from "react";
import { createRoot } from "react-dom/client";
import "@/app/globals.css";
import "@/components/crm/crm-platinum.css";
import { CrmNavigation, crmNavigation } from "@/components/crm/CrmNavigation";

function Preview() {
  const [activeTab, setActiveTab] = useState<typeof crmNavigation[number]["id"]>("tracking");
  return <div className="crm-app-shell crm-platinum-shell">
    <CrmNavigation activeTab={activeTab} onNavigate={setActiveTab} onRefresh={() => {}} onSignOut={() => {}} busy={false} />
    <main className="crm-platinum-main">
      <div className="crm-platinum-content">
        <h1>Independent navigation scrolling</h1>
        <p>Sample layout · Scroll this workspace, then scroll the navigation.</p>
        {Array.from({ length: 16 }, (_, index) => <section key={index} style={{ padding: 32, marginBlock: 16, minHeight: 180, background: "#202323", borderRadius: 16 }}><h2>Workspace section {index + 1}</h2><p>Selected page: {activeTab}</p></section>)}
      </div>
    </main>
  </div>;
}

createRoot(document.getElementById("root")!).render(<Preview />);
