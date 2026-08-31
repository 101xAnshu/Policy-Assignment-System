import React, { useState } from "react";
import { verifyIncrementalSystem } from "../api";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Play,
  X,
} from "lucide-react";

interface VerifyModalProps {
  onClose: () => void;
}

export const VerifyModal: React.FC<VerifyModalProps> = ({ onClose }) => {
  const [running, setRunning] = useState<boolean>(false);
  const [report, setReport] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRunVerify = async () => {
    setRunning(true);
    setError(null);
    try {
      const data = await verifyIncrementalSystem();
      setReport(data);
    } catch (err: any) {
      setError(err.message || "Failed to execute system verification");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-surface border border-border rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-accent" />
            <div>
              <h3 className="font-heading text-[15px] font-semibold text-primary">
                System verification
              </h3>
              <p className="text-xs text-secondary mt-0.5">
                Verifies incremental reconciliation matches independent recomputation
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-secondary hover:text-primary transition-colors p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {!report && !running && (
            <div className="py-10 text-center space-y-4">
              <ShieldCheck className="w-10 h-10 text-secondary mx-auto" />
              <div className="space-y-1.5 max-w-md mx-auto">
                <h4 className="text-sm font-medium text-primary">Automated invariant verification</h4>
                <p className="text-xs text-secondary leading-relaxed">
                  Generates 30 synthetic employees, 10 rules, and applies 50 randomized mutations.
                  Verifies that scoped incremental diffs produce identical state to a brute-force
                  reference recomputation.
                </p>
              </div>
              <button
                onClick={handleRunVerify}
                className="px-4 py-2 rounded bg-accent hover:bg-accent-500 text-white text-[13px] font-medium transition-colors inline-flex items-center gap-2"
              >
                <Play className="w-3.5 h-3.5" /> Run verification
              </button>
            </div>
          )}

          {running && (
            <div className="py-12 text-center space-y-3">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-accent" />
              <div className="space-y-1">
                <h4 className="text-sm font-medium text-primary">Running 50 mutation scenarios...</h4>
                <p className="text-xs text-secondary">
                  Evaluating incremental diffs vs independent reference resolver
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded bg-status-error/10 border border-status-error/20 text-status-error text-xs flex items-center gap-2">
              <XCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}

          {report && (
            <div className="space-y-5">
              {/* Verdict Banner */}
              <div
                className={`p-4 rounded border flex items-center justify-between ${
                  report.equality
                    ? "bg-status-success/5 border-status-success/20"
                    : "bg-status-error/5 border-status-error/20"
                }`}
              >
                <div className="flex items-center gap-3">
                  {report.equality ? (
                    <CheckCircle2 className="w-5 h-5 text-status-success" />
                  ) : (
                    <XCircle className="w-5 h-5 text-status-error" />
                  )}
                  <div>
                    <h4 className="text-sm font-medium text-primary">
                      {report.equality
                        ? "Equivalence verified"
                        : "Mismatch detected"}
                    </h4>
                    <p className="text-xs text-secondary mt-0.5">
                      Incremental reconciliation converges to reference recomputation
                    </p>
                  </div>
                </div>

                <span className="text-xs font-mono text-secondary px-2 py-1 rounded bg-surface-raised border border-border">
                  {report.stats.executionTimeMs}ms
                </span>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { value: report.stats.totalEmployees, label: "Employees" },
                  { value: report.stats.totalEventsApplied, label: "Mutations" },
                  { value: report.stats.incrementalAssignmentsCount, label: "Incremental" },
                  { value: report.stats.fullRecomputeAssignmentsCount, label: "Full recompute" },
                ].map((stat) => (
                  <div key={stat.label} className="p-3 rounded bg-surface-raised border border-border text-center">
                    <div className="text-lg font-heading font-semibold text-primary font-mono">{stat.value}</div>
                    <div className="text-[11px] text-secondary mt-0.5">{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* Invariants Checklist */}
              <div className="p-4 rounded bg-background border border-border space-y-2">
                <h4 className="text-xs font-medium text-secondary mb-2">
                  Invariant checks
                </h4>
                {Object.entries(report.invariantsVerified).map(([key, val]: any) => (
                  <div key={key} className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0">
                    <span className="text-primary">{key}</span>
                    <span
                      className={`font-medium px-2 py-0.5 rounded text-[11px] ${
                        val === "PASS"
                          ? "bg-status-success/10 text-status-success"
                          : "bg-status-error/10 text-status-error"
                      }`}
                    >
                      {val}
                    </span>
                  </div>
                ))}
              </div>

              {/* Sample Event Stream */}
              {report.reproducibleSampleEvents?.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-secondary">
                    Sample mutation trace
                  </h4>
                  <div className="p-3 rounded bg-background border border-border font-mono text-[11px] text-secondary space-y-0.5 max-h-32 overflow-y-auto">
                    {report.reproducibleSampleEvents?.map((e: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-tertiary">[{String(e.step).padStart(2, "0")}]</span>
                        <span className="text-primary">{e.event}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-between">
          <span className="text-xs text-tertiary">
            Idempotent convergence verification
          </span>
          <div className="flex items-center gap-2">
            {report && (
              <button
                onClick={handleRunVerify}
                disabled={running}
                className="px-3 py-1.5 rounded text-[13px] font-medium bg-surface-raised hover:bg-surface-highlight text-primary border border-border transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Re-run
              </button>
            )}
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded text-[13px] font-medium bg-accent hover:bg-accent-500 text-white transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
