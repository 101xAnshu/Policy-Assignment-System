import React, { useState, useEffect } from "react";
import { fetchAuditLogs, fetchEmployees, fetchPolicies } from "../api";
import {
  ShieldAlert,
  Search,
  Filter,
  Calendar,
  User,
  Sparkles,
  Layers,
  FileCheck,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { WhyModal } from "./WhyModal";

export const AuditView: React.FC = () => {
  const [events, setEvents] = useState<any[]>([]);
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState<boolean>(false);

  // Standalone Why Inspector State
  const [employees, setEmployees] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [whyEmpId, setWhyEmpId] = useState<string>("");
  const [whyPolicyId, setWhyPolicyId] = useState<string>("");
  const [whyDate, setWhyDate] = useState<string>("2024-08-28");
  const [showWhyModal, setShowWhyModal] = useState<boolean>(false);

  const loadAudit = async () => {
    setLoading(true);
    try {
      const filters: Record<string, string> = {};
      if (eventTypeFilter !== "ALL") filters.eventType = eventTypeFilter;
      const res = await fetchAuditLogs(filters);
      setEvents(res.events || []);
    } catch (err) {
      console.error("Audit load error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAudit();
  }, [eventTypeFilter]);

  useEffect(() => {
    Promise.all([fetchEmployees(), fetchPolicies()]).then(([emps, pols]) => {
      setEmployees(emps);
      setPolicies(pols);
      if (emps.length > 0) setWhyEmpId(emps[0].id);
      if (pols.length > 0) setWhyPolicyId(pols[0].id);
    });
  }, []);

  const selectedEmpObj = employees.find((e) => e.id === whyEmpId);
  const selectedPolObj = policies.find((p) => p.id === whyPolicyId);

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-background p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white flex items-center gap-2.5">
          <ShieldAlert className="w-6 h-6 text-brand-400" /> Audit Log & "Why?" Inspector
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Complete point-in-time audit trails with frozen decision snapshots and on-demand explainability reasoning.
        </p>
      </div>

      {/* Standalone Why Inspector Playground */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-brand-950/40 via-surface to-surface border border-brand-500/30 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-brand-500/10 text-brand-400 border border-brand-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Live "Why?" Policy Reasoning Playground</h2>
              <p className="text-xs text-slate-400">
                Ask why any employee has or does not have any policy at any historical date.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowWhyModal(true)}
            disabled={!whyEmpId || !whyPolicyId}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl bg-brand-500 hover:bg-brand-600 text-white shadow-lg shadow-brand-500/20 transition-colors disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" /> Explain Assignment
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase block mb-1.5">
              Employee:
            </label>
            <select
              value={whyEmpId}
              onChange={(e) => setWhyEmpId(e.target.value)}
              className="w-full bg-surface-raised border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-brand-500"
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.department} • {e.state || e.country})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase block mb-1.5">
              Target Policy:
            </label>
            <select
              value={whyPolicyId}
              onChange={(e) => setWhyPolicyId(e.target.value)}
              className="w-full bg-surface-raised border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-brand-500"
            >
              {policies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.categoryName})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase block mb-1.5">
              Effective Date:
            </label>
            <input
              type="date"
              value={whyDate}
              onChange={(e) => setWhyDate(e.target.value)}
              className="w-full bg-surface-raised border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:outline-none font-mono"
            />
          </div>
        </div>
      </div>

      {/* Audit Log Table Header & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-surface/60 border border-slate-800 p-4 rounded-2xl">
        <div className="flex items-center gap-3">
          <FileCheck className="w-5 h-5 text-cyan-400" />
          <span className="font-bold text-sm text-white">Audit Trail ({events.length})</span>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs text-slate-400 font-semibold">Event Type:</span>
          <select
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
            className="bg-surface-raised border border-slate-700 text-white text-xs rounded-xl px-3 py-1.5 focus:outline-none"
          >
            <option value="ALL">All Events</option>
            <option value="POLICY_ASSIGNED">POLICY_ASSIGNED</option>
            <option value="POLICY_REVOKED">POLICY_REVOKED</option>
            <option value="EMPLOYEE_PROFILE_UPDATED">EMPLOYEE_PROFILE_UPDATED</option>
            <option value="RULE_PUBLISHED">RULE_PUBLISHED</option>
          </select>
        </div>
      </div>

      {/* Audit Events List */}
      <div className="space-y-3">
        {events.map((ev) => (
          <div
            key={ev.id}
            className="p-4 rounded-2xl bg-surface-raised/40 border border-slate-800 hover:border-slate-700 transition-all space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                    ev.eventType === "POLICY_ASSIGNED"
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                      : ev.eventType === "POLICY_REVOKED"
                      ? "bg-rose-500/15 text-rose-400 border border-rose-500/20"
                      : "bg-brand-500/15 text-brand-400 border border-brand-500/20"
                  }`}
                >
                  {ev.eventType}
                </span>
                <span className="text-xs font-semibold text-white">
                  Entity: {ev.entityType} ({ev.entityId})
                </span>
              </div>
              <div className="text-xs text-slate-400 font-mono flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" />
                <span>Effective: {ev.effectiveAt}</span>
              </div>
            </div>

            <div className="text-xs text-slate-300 bg-surface/80 p-3 rounded-xl border border-slate-800/80 font-mono">
              <pre className="whitespace-pre-wrap">{JSON.stringify(ev.payload, null, 2)}</pre>
            </div>
          </div>
        ))}

        {events.length === 0 && !loading && (
          <div className="py-16 text-center text-slate-500 text-sm">
            No audit records matching filter criteria.
          </div>
        )}
      </div>

      {/* "Why?" Modal */}
      {showWhyModal && selectedEmpObj && selectedPolObj && (
        <WhyModal
          employeeId={selectedEmpObj.id}
          employeeName={selectedEmpObj.name}
          policyId={selectedPolObj.id}
          policyName={selectedPolObj.name}
          date={whyDate}
          onClose={() => setShowWhyModal(false)}
        />
      )}
    </div>
  );
};
