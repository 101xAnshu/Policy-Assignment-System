import React, { useState, useEffect } from "react";
import {
  fetchEmployees,
  previewReconcile,
  executeReconcile,
  reconcileCompany,
  fetchOutboxEvents,
  fetchTemporalJobs,
  processOutbox,
  processTemporal,
} from "../api";
import {
  RefreshCw,
  PlusCircle,
  MinusCircle,
  CheckCircle2,
  AlertCircle,
  Play,
  Zap,
  Clock,
  Calendar,
  Layers,
  Sparkles,
} from "lucide-react";

export const ReconcileView: React.FC = () => {
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [date, setDate] = useState<string>("2024-08-28");
  const [diff, setDiff] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [executing, setExecuting] = useState<boolean>(false);
  const [lastResult, setLastResult] = useState<any | null>(null);

  // Worker status
  const [outboxEvents, setOutboxEvents] = useState<any[]>([]);
  const [temporalJobs, setTemporalJobs] = useState<any[]>([]);
  const [processingWorker, setProcessingWorker] = useState<boolean>(false);

  const loadData = async () => {
    const emps = await fetchEmployees();
    setEmployees(emps);
    if (emps.length > 0 && !selectedEmpId) {
      setSelectedEmpId(emps[0].id);
    }
    loadWorkerStatus();
  };

  const loadWorkerStatus = async () => {
    try {
      const [oEvents, tJobs] = await Promise.all([
        fetchOutboxEvents().catch(() => []),
        fetchTemporalJobs().catch(() => []),
      ]);
      setOutboxEvents(oEvents);
      setTemporalJobs(tJobs);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handlePreview = async () => {
    if (!selectedEmpId) return;
    setLoading(true);
    try {
      const res = await previewReconcile(selectedEmpId, date);
      setDiff(res.diff);
    } catch (err: any) {
      alert("Preview error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedEmpId) {
      handlePreview();
    }
  }, [selectedEmpId, date]);

  const handleExecute = async () => {
    if (!selectedEmpId) return;
    setExecuting(true);
    try {
      const res = await executeReconcile(selectedEmpId, date);
      setLastResult(res);
      await handlePreview();
      await loadWorkerStatus();
    } catch (err: any) {
      alert("Execution error: " + err.message);
    } finally {
      setExecuting(false);
    }
  };

  const handleCompanyReconcile = async () => {
    if (employees.length === 0) return;
    const companyId = employees[0].companyId;
    setExecuting(true);
    try {
      const res = await reconcileCompany(companyId, date);
      alert(`Company Reconciled: ${res.totalEmployees} employees processed, ${res.totalAdded} additions, ${res.totalRevoked} revocations.`);
      await handlePreview();
      await loadWorkerStatus();
    } catch (err: any) {
      alert("Reconcile error: " + err.message);
    } finally {
      setExecuting(false);
    }
  };

  const handleTriggerOutbox = async () => {
    setProcessingWorker(true);
    try {
      const res = await processOutbox();
      alert(`Outbox Worker processed: ${res.processed} events.`);
      await loadWorkerStatus();
      await handlePreview();
    } catch (err: any) {
      alert("Worker error: " + err.message);
    } finally {
      setProcessingWorker(false);
    }
  };

  const handleTriggerTemporal = async () => {
    setProcessingWorker(true);
    try {
      const res = await processTemporal(date);
      alert(`Temporal Worker processed: ${res.processed} milestone jobs.`);
      await loadWorkerStatus();
      await handlePreview();
    } catch (err: any) {
      alert("Worker error: " + err.message);
    } finally {
      setProcessingWorker(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-background p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2.5">
            <RefreshCw className="w-6 h-6 text-brand-400" /> Reconciliation & Convergence Center
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Compare desired deterministic policy state against live assignments, preview atomic diffs, and converge idempotently.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleCompanyReconcile}
            disabled={executing}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-surface-raised border border-slate-700 hover:border-brand-500 text-slate-200 hover:text-white transition-colors"
          >
            <Sparkles className="w-4 h-4 text-cyan-400" /> Reconcile All Employees
          </button>
          <button
            onClick={handleExecute}
            disabled={executing || !diff || (!diff.toAdd.length && !diff.toRevoke.length)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-brand-500 hover:bg-brand-600 text-white shadow-lg shadow-brand-500/20 transition-colors disabled:opacity-50"
          >
            <Play className="w-4 h-4" /> {executing ? "Converging..." : "Execute Reconcile"}
          </button>
        </div>
      </div>

      {/* Selector & Date Controls */}
      <div className="flex flex-wrap items-center gap-4 bg-surface/60 border border-slate-800 p-4 rounded-2xl">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-400 uppercase">Target Employee:</label>
          <select
            value={selectedEmpId}
            onChange={(e) => setSelectedEmpId(e.target.value)}
            className="bg-surface-raised border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-brand-500"
          >
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name} ({emp.department} • {emp.state || emp.country})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-cyan-400" />
          <label className="text-xs font-semibold text-slate-400 uppercase">Effective Date:</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-surface-raised border border-slate-700 text-white text-xs rounded-xl px-3 py-1.5 focus:outline-none font-mono"
          />
        </div>

        <button
          onClick={handlePreview}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-semibold bg-surface-raised hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-xl transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh Diff
        </button>
      </div>

      {/* Diff Overview Stats */}
      {diff && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400">
              <PlusCircle className="w-6 h-6" />
            </div>
            <div>
              <span className="text-2xl font-black text-white">{diff.toAdd.length}</span>
              <p className="text-xs text-emerald-400 font-semibold uppercase tracking-wider">To Add</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/30 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-rose-500/10 text-rose-400">
              <MinusCircle className="w-6 h-6" />
            </div>
            <div>
              <span className="text-2xl font-black text-white">{diff.toRevoke.length}</span>
              <p className="text-xs text-rose-400 font-semibold uppercase tracking-wider">To Revoke</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/30 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400">
              <RefreshCw className="w-6 h-6" />
            </div>
            <div>
              <span className="text-2xl font-black text-white">{diff.toUpdate?.length || 0}</span>
              <p className="text-xs text-amber-400 font-semibold uppercase tracking-wider">To Update</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-surface-raised/40 border border-slate-800 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-slate-800 text-slate-400">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <span className="text-2xl font-black text-white">{diff.unchanged.length}</span>
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Unchanged</p>
            </div>
          </div>
        </div>
      )}

      {/* Diff Details Breakdown */}
      {diff && (
        <div className="space-y-4">
          {/* Additions */}
          {diff.toAdd.length > 0 && (
            <div className="p-5 rounded-2xl bg-surface/60 border border-slate-800 space-y-3">
              <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                <PlusCircle className="w-4 h-4" /> Policies To Be Assigned ({diff.toAdd.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {diff.toAdd.map((item: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-emerald-950/15 border border-emerald-500/20 flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-white text-sm">{item.policyName}</span>
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                        Priority: {item.sourceRulePriority || 10}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300">{item.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Revocations */}
          {diff.toRevoke.length > 0 && (
            <div className="p-5 rounded-2xl bg-surface/60 border border-slate-800 space-y-3">
              <h3 className="text-sm font-bold text-rose-400 flex items-center gap-2">
                <MinusCircle className="w-4 h-4" /> Policies To Be Revoked ({diff.toRevoke.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {diff.toRevoke.map((item: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-rose-950/15 border border-rose-500/20 flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-white text-sm">{item.policyName}</span>
                      <span className="text-[10px] font-mono text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded">
                        Revocation
                      </span>
                    </div>
                    <p className="text-xs text-slate-300">{item.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Outbox & Temporal Worker Runner */}
      <div className="p-5 rounded-2xl bg-surface-raised/40 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" /> Background Outbox & Temporal Milestone Runner
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Processes asynchronous event queues and future milestone evaluations.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleTriggerOutbox}
              disabled={processingWorker}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 transition-colors"
            >
              <Zap className="w-3.5 h-3.5" /> Process Outbox Queue
            </button>
            <button
              onClick={handleTriggerTemporal}
              disabled={processingWorker}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/30 transition-colors"
            >
              <Clock className="w-3.5 h-3.5" /> Process Due Milestones
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-surface border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-white">Outbox Events Table</span>
              <span className="text-slate-400 font-mono">{outboxEvents.length} recorded</span>
            </div>
            <p className="text-slate-400">
              Captures attribute changes and publishes domain events inside the database transaction.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-surface border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-white">Temporal Milestone Jobs</span>
              <span className="text-slate-400 font-mono">{temporalJobs.length} scheduled</span>
            </div>
            <p className="text-slate-400">
              Future milestone trigger dates (e.g. Sarah Chen 24-month tenure promotion on 2026-08-28).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
