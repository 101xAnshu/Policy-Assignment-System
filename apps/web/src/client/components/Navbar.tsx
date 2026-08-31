import React from "react";
import {
  ShieldCheck,
  Users,
  FileText,
  RefreshCw,
  Activity,
  GitBranch,
} from "lucide-react";

export type NavTab = "graph" | "employees" | "rules" | "reconcile" | "audit";

interface NavbarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenVerify: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onSelectTab, onOpenVerify }) => {
  const tabs = [
    { id: "graph", label: "Resolution", icon: GitBranch },
    { id: "employees", label: "Employees", icon: Users },
    { id: "rules", label: "Rules", icon: FileText },
    { id: "reconcile", label: "Reconciliation", icon: RefreshCw },
    { id: "audit", label: "Activity", icon: Activity },
  ];

  return (
    <header className="h-14 border-b border-border bg-surface flex items-center justify-between px-5 select-none">
      {/* Brand */}
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
          <ShieldCheck className="w-4 h-4 text-white" />
        </div>
        <div>
          <span className="font-heading font-semibold text-primary text-sm">Warp</span>
          <span className="text-xs text-secondary ml-1.5">Policy Engine</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex items-center gap-0.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id as NavTab)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[13px] font-medium transition-colors ${
                isActive
                  ? "bg-surface-raised text-primary"
                  : "text-secondary hover:text-primary hover:bg-surface-raised/50"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenVerify}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[13px] font-medium text-secondary hover:text-primary hover:bg-surface-raised transition-colors"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Verify system</span>
        </button>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-status-success">
          <span className="w-1.5 h-1.5 rounded-full bg-status-success"></span>
          <span>Healthy</span>
        </div>
      </div>
    </header>
  );
};
