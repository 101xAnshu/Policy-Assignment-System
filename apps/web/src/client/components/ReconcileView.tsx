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
  Plus,
  Minus,
  CheckCircle2,
  Play,
  Zap,
  Clock,
  Calendar,
  Layers,
  User,
} from "lucide-react";

export const ReconcileView: React.FC = () => {
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [date, setDate] = useState<string>("2024-08-28");
  const [diff, setDiff] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [executing, setExecuting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

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
      console.error("Preview error:", err.message);
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
    setStatusMessage(null);
    try {
      const res = await executeReconcile(selectedEmpId, date);
      setStatusMessage(`Reconciliation completed. ${res.added?.length || 0} added, ${res.revoked?.length || 0} revoked.`);
      await handlePreview();
      await loadWorkerStatus();
    } catch (err: any) {
      console.error("Execution error:", err.message);
      setStatusMessage(`Reconciliation failed: ${err.message}`);
    } finally {
      setExecuting(false);
    }
  };

  const handleCompanyReconcile = async () => {
    if (employees.length === 0) return;
    const companyId = employees[0].companyId;
    setExecuting(true);
    setStatusMessage(null);
    try {
      const res = await reconcileCompany(companyId, date);
      setStatusMessage(`Company reconciled: ${res.totalEmployees} employees evaluated, ${res.totalAdded} additions, ${res.totalRevoked} revocations.`);
      await handlePreview();
      await loadWorkerStatus();
    } catch (err: any) {
      console.error("Reconcile error:", err.message);
      setStatusMessage(`Company reconciliation failed: ${err.message}`);
    } finally {
      setExecuting(false);
    }
  };

  const handleTriggerOutbox = async () => {
    setProcessingWorker(true);
    setStatusMessage(null);
    try {
      const res = await processOutbox();
      setStatusMessage(`Outbox processor completed: ${res.processed} events processed.`);
      await loadWorkerStatus();
      await handlePreview();
    } catch (err: any) {
      console.error("Worker error:", err.message);
      setStatusMessage(`Outbox worker error: ${err.message}`);
    } finally {
      setProcessingWorker(false);
    }
  };

  const handleTriggerTemporal = async () => {
    setProcessingWorker(true);
    setStatusMessage(null);
    try {
      const res = await processTemporal(date);
      setStatusMessage(`Temporal milestone processor completed: ${res.processed} jobs processed.`);
      await loadWorkerStatus();
      await handlePreview();
    } catch (err: any) {
      console.error("Worker error:", err.message);
      setStatusMessage(`Temporal worker error: ${err.message}`);
    } finally {
      setProcessingWorker(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-background p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-lg font-semibold text-primary flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-secondary" /> Reconciliation
          </h1>
          <p className="text-xs text-secondary mt-0.5">
            Compare desired policy state against active assignments and converge idempotently
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCompanyReconcile}
            disabled={executing}
            className="px-3 py-1.5 rounded text-[13px] font-medium bg-surface-raised hover:bg-surface-highlight text-primary border border-border transition-colors flex items-center gap-1.5"
          >
            <Layers className="w-3.5 h-3.5 text-secondary" /> Reconcile all
          </button>
          <button
            onClick={handleExecute}
            disabled={executing || !diff || (!diff.toAdd?.length && !diff.toRevoke?.length)}
            className="px-3 py-1.5 rounded text-[13px] font-medium bg-accent hover:bg-accent-500 text-white transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5" /> {executing ? "Converging..." : "Execute reconcile"}
          </button>
        </div>
      </div>

      {/* Status banner */}
      {statusMessage && (
        <div className="p-3 rounded bg-surface border border-border text-xs text-primary flex items-center justify-between">
          <span>{statusMessage}</span>
          <button onClick={() => setStatusMessage(null)} className="text-secondary hover:text-primary text-[11px]">
            Dismiss
          </button>
        </div>
      )}

      {/* Target Selector & Date Controls */}
      <div className="flex flex-wrap items-center gap-3 bg-surface border border-border p-3.5 rounded">
        <div className="flex items-center gap-2">
          <User className="w-3.5 h-3.5 text-secondary" />
          <select
            value={selectedEmpId}
            onChange={(e) => setSelectedEmpId(e.target.value)}
            className="bg-surface-raised border border-border text-primary text-[13px] rounded px-2.5 py-1.5 focus:outline-none focus:border-accent"
          >
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name} ({emp.department} · {emp.state || emp.country})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 pl-3 border-l border-border">
          <Calendar className="w-3.5 h-3.5 text-secondary" />
          <span className="text-xs text-secondary">Effective:</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-surface-raised border border-border text-primary text-[13px] rounded px-2.5 py-1.5 focus:outline-none focus:border-accent font-mono"
          />
        </div>

        <button
          onClick={handlePreview}
          disabled={loading}
          className="ml-auto flex items-center gap-1 text-xs text-secondary hover:text-primary px-2.5 py-1.5 rounded bg-surface-raised border border-border transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Diff Overview Stats */}
      {diff && (
        <div className="grid grid-cols-4 gap-3">
          <div className="p-3.5 rounded bg-surface border border-border text-center">
            <div className="text-xl font-heading font-semibold text-status-success font-mono">
              +{diff.toAdd?.length || 0}
            </div>
            <div className="text-[11px] text-secondary mt-0.5">To add</div>
          </div>

          <div className="p-3.5 rounded bg-surface border border-border text-center">
            <div className="text-xl font-heading font-semibold text-status-error font-mono">
              -{diff.toRevoke?.length || 0}
            </div>
            <div className="text-[11px] text-secondary mt-0.5">To revoke</div>
          </div>

          <div className="p-3.5 rounded bg-surface border border-border text-center">
            <div className="text-xl font-heading font-semibold text-status-warning font-mono">
              ~{diff.toUpdate?.length || 0}
            </div>
            <div className="text-[11px] text-secondary mt-0.5">To update</div>
          </div>

          <div className="p-3.5 rounded bg-surface border border-border text-center">
            <div className="text-xl font-heading font-semibold text-primary font-mono">
              {diff.unchanged?.length || 0}
            </div>
            <div className="text-[11px] text-secondary mt-0.5">Unchanged</div>
          </div>
        </div>
      )}

      {/* Diff Details Breakdown */}
      {diff && (
        <div className="space-y-3">
          {diff.toAdd?.length > 0 && (
            <div className="p-4 rounded bg-surface border border-border space-y-2">
              <h3 className="text-xs font-medium text-status-success flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Policies to be assigned ({diff.toAdd.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {diff.toAdd.map((item: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3 rounded bg-background border border-border flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-primary text-xs">{item.policyName}</span>
                      <span className="text-[10px] font-mono text-secondary px-1.5 py-0.5 rounded bg-surface-raised border border-border">
                        P{item.sourceRulePriority || 10}
                      </span>
                    </div>
                    <p className="text-[11px] text-secondary">{item.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {diff.toRevoke?.length > 0 && (
            <div className="p-4 rounded bg-surface border border-border space-y-2">
              <h3 className="text-xs font-medium text-status-error flex items-center gap-1.5">
                <Minus className="w-3.5 h-3.5" /> Policies to be revoked ({diff.toRevoke.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {diff.toRevoke.map((item: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3 rounded bg-background border border-border flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-primary text-xs">{item.policyName}</span>
                      <span className="text-[10px] font-mono text-status-error bg-status-error/10 px-1.5 py-0.5 rounded">
                        Revoke
                      </span>
                    </div>
                    <p className="text-[11px] text-secondary">{item.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {diff.toAdd?.length === 0 && diff.toRevoke?.length === 0 && (
            <div className="p-6 rounded bg-surface border border-border text-center text-secondary text-xs">
              State is fully converged. No pending additions or revocations.
            </div>
          )}
        </div>
      )}

      {/* Background Worker Queues */}
      <div className="p-4 rounded bg-surface border border-border space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-primary flex items-center gap-2">
              <Zap className="w-4 h-4 text-accent" /> Background queues
            </h3>
            <p className="text-xs text-secondary mt-0.5">
              Asynchronous event queues and scheduled milestone jobs
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleTriggerOutbox}
              disabled={processingWorker}
              className="px-2.5 py-1 text-xs font-medium rounded bg-surface-raised hover:bg-surface-highlight text-primary border border-border transition-colors flex items-center gap-1"
            >
              <Zap className="w-3 h-3 text-accent" /> Process outbox
            </button>
            <button
              onClick={handleTriggerTemporal}
              disabled={processingWorker}
              className="px-2.5 py-1 text-xs font-medium rounded bg-surface-raised hover:bg-surface-highlight text-primary border border-border transition-colors flex items-center gap-1"
            >
              <Clock className="w-3 h-3 text-secondary" /> Process milestones
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded bg-background border border-border">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-primary">Outbox events</span>
              <span className="text-tertiary font-mono">{outboxEvents.length} pending</span>
            </div>
            <p className="text-secondary text-[11px]">
              Captures transactional domain mutations for asynchronous reconciliation.
            </p>
          </div>

          <div className="p-3 rounded bg-background border border-border">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-primary">Temporal jobs</span>
              <span className="text-tertiary font-mono">{temporalJobs.length} scheduled</span>
            </div>
            <p className="text-secondary text-[11px]">
              Scheduled milestone triggers (e.g. 24-month tenure promotions).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
