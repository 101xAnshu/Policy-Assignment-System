import React, { useState, useEffect } from "react";
import { fetchAuditLogs, fetchEmployees, fetchPolicies } from "../api";
import {
  Activity,
  Filter,
  Calendar,
  User,
  HelpCircle,
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

  const inputClass = "w-full bg-background border border-border text-primary text-[13px] rounded px-3 py-2 focus:outline-none focus:border-accent transition-colors";
  const labelClass = "block text-xs font-medium text-secondary mb-1.5";

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-background p-5 space-y-4">
      {/* Header */}
      <div>
        <h1 className="font-heading text-lg font-semibold text-primary flex items-center gap-2">
          <Activity className="w-5 h-5 text-secondary" /> Activity & audit trail
        </h1>
        <p className="text-xs text-secondary mt-0.5">
          Point-in-time audit logs with frozen decision snapshots and policy explanations
        </p>
      </div>

      {/* Standalone Policy Explanation Card */}
      <div className="p-4 rounded bg-surface border border-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-accent" />
            <div>
              <h2 className="text-sm font-medium text-primary">Policy explainability</h2>
              <p className="text-xs text-secondary mt-0.5">
                Inspect why any employee was or was not assigned a policy at any historical date
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowWhyModal(true)}
            disabled={!whyEmpId || !whyPolicyId}
            className="px-3.5 py-1.5 rounded text-[13px] font-medium bg-accent hover:bg-accent-500 text-white transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <HelpCircle className="w-3.5 h-3.5" /> Explain assignment
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          <div>
            <label className={labelClass}>Employee</label>
            <select
              value={whyEmpId}
              onChange={(e) => setWhyEmpId(e.target.value)}
              className={inputClass}
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.department} · {e.state || e.country})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Target policy</label>
            <select
              value={whyPolicyId}
              onChange={(e) => setWhyPolicyId(e.target.value)}
              className={inputClass}
            >
              {policies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.categoryName})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Effective date</label>
            <input
              type="date"
              value={whyDate}
              onChange={(e) => setWhyDate(e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </div>
        </div>
      </div>

      {/* Audit Log Header & Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface border border-border p-3 rounded">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-primary">Audit events</span>
          <span className="text-xs font-mono text-tertiary">({events.length})</span>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-secondary" />
          <span className="text-xs text-secondary">Event type:</span>
          <select
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
            className="bg-surface-raised border border-border text-primary text-[13px] rounded px-2.5 py-1 focus:outline-none focus:border-accent"
          >
            <option value="ALL">All events</option>
            <option value="POLICY_ASSIGNED">POLICY_ASSIGNED</option>
            <option value="POLICY_REVOKED">POLICY_REVOKED</option>
            <option value="EMPLOYEE_PROFILE_UPDATED">EMPLOYEE_PROFILE_UPDATED</option>
            <option value="RULE_PUBLISHED">RULE_PUBLISHED</option>
          </select>
        </div>
      </div>

      {/* Audit Events List */}
      <div className="space-y-2">
        {events.map((ev) => (
          <div
            key={ev.id}
            className="p-3.5 rounded bg-surface border border-border space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span
                  className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded ${
                    ev.eventType === "POLICY_ASSIGNED"
                      ? "bg-status-success/10 text-status-success"
                      : ev.eventType === "POLICY_REVOKED"
                      ? "bg-status-error/10 text-status-error"
                      : "bg-surface-raised text-secondary border border-border"
                  }`}
                >
                  {ev.eventType}
                </span>
                <span className="text-xs text-primary font-medium">
                  {ev.entityType} <span className="font-mono text-tertiary font-normal">({ev.entityId})</span>
                </span>
              </div>
              <div className="text-xs text-tertiary font-mono flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                <span>Effective: {ev.effectiveAt}</span>
              </div>
            </div>

            <div className="text-xs text-secondary bg-background p-2.5 rounded border border-border/60 font-mono overflow-x-auto">
              <pre className="whitespace-pre-wrap">{JSON.stringify(ev.payload, null, 2)}</pre>
            </div>
          </div>
        ))}

        {events.length === 0 && !loading && (
          <div className="py-12 text-center text-tertiary text-xs">
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
