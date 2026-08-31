import React, { useState } from "react";
import { Navbar, type NavTab } from "./components/Navbar";
import { ResolutionGraph } from "./components/ResolutionGraph";
import { EmployeesView } from "./components/EmployeesView";
import { RulesView } from "./components/RulesView";
import { ReconcileView } from "./components/ReconcileView";
import { AuditView } from "./components/AuditView";
import { VerifyModal } from "./components/VerifyModal";

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavTab>("graph");
  const [showVerifyModal, setShowVerifyModal] = useState<boolean>(false);

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-primary overflow-hidden">
      <Navbar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        onOpenVerify={() => setShowVerifyModal(true)}
      />

      <main className="flex-1 flex overflow-hidden">
        {currentTab === "graph" && <ResolutionGraph />}
        {currentTab === "employees" && <EmployeesView />}
        {currentTab === "rules" && <RulesView />}
        {currentTab === "reconcile" && <ReconcileView />}
        {currentTab === "audit" && <AuditView />}
      </main>

      {showVerifyModal && (
        <VerifyModal onClose={() => setShowVerifyModal(false)} />
      )}
    </div>
  );
};
