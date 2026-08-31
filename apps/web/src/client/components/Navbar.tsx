import React from "react";
import {
  Shield,
  Activity,
  Users,
  FileCode2,
  RefreshCw,
  Search,
  Sparkles,
  GitBranch,
  ShieldCheck,
} from "lucide-react";

export type NavTab = "graph" | "employees" | "rules" | "reconcile" | "audit";

interface NavbarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenVerify: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onSelectTab, onOpenVerify }) => {
  const tabs = [
    { id: "graph", label: "Resolution DAG", icon: GitBranch },
    { id: "employees", label: "Employees & Timeline", icon: Users },
    { id: "rules", label: "Rules Matrix", icon: FileCode2 },
    { id: "reconcile", label: "Reconciliation & Diff", icon: RefreshCw },
    { id: "audit", label: "Audit & 'Why?' Engine", icon: Search },
  ];

  return (
    <header className="h-16 border-b border-slate-800 bg-surface/90 backdrop-blur px-6 flex items-center justify-between select-none">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-brand-500/25 border border-brand-400/30">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-white text-base tracking-tight">WARP</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-300 border border-brand-500/30 font-mono">
              POLICY ENGINE
            </span>
          </div>
          <p className="text-[10px] text-slate-400 font-medium">Acme Corp • Point-in-Time Resolution</p>
        </div>
      </div>

      {/* Tabs */}
      <nav className="flex items-center gap-1 bg-surface-raised/60 p-1 rounded-2xl border border-slate-800">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id as NavTab)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                isActive
                  ? "bg-brand-500 text-white shadow-md shadow-brand-500/20"
                  : "text-slate-400 hover:text-slate-200 hover:bg-surface-raised"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Verify System Button & Status */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenVerify}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500/20 to-teal-500/20 hover:from-emerald-500/30 hover:to-teal-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold transition-all shadow-sm"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Verify System (§41)</span>
        </button>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-950/30 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Deterministic</span>
        </div>
      </div>
    </header>
  );
};
