import React, { useState } from "react";
import { Navbar, type NavTab } from "./components/Navbar";
import { ResolutionGraph } from "./components/ResolutionGraph";
import { EmployeesView } from "./components/EmployeesView";
import { RulesView } from "./components/RulesView";
import { ReconcileView } from "./components/ReconcileView";
import { AuditView } from "./components/AuditView";

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavTab>("graph");

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-slate-100 overflow-hidden">
      <Navbar currentTab={currentTab} onSelectTab={setCurrentTab} />

      <main className="flex-1 flex overflow-hidden">
        {currentTab === "graph" && <ResolutionGraph />}
        {currentTab === "employees" && <EmployeesView />}
        {currentTab === "rules" && <RulesView />}
        {currentTab === "reconcile" && <ReconcileView />}
        {currentTab === "audit" && <AuditView />}
      </main>
    </div>
  );
};
