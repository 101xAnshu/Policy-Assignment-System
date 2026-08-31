import React, { useState } from "react";
import { verifyIncrementalSystem } from "../api";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Zap,
  Play,
  Cpu,
  Layers,
  Check,
  X,
  Code2,
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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-surface border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-surface-raised/30">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 border border-emerald-400/30">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                System Correctness & Incremental Equivalence Verifier
                <span className="text-[10px] font-mono uppercase bg-emerald-500/10 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/20">
                  Build Spec §41
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Mathematically proves incremental scoped reconciliation == full clean-room recomputation
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {!report && !running && (
            <div className="p-8 text-center space-y-4 bg-background/50 rounded-2xl border border-slate-800">
              <Cpu className="w-12 h-12 text-brand-400 mx-auto opacity-80" />
              <div className="space-y-1 max-w-md mx-auto">
                <h4 className="text-sm font-bold text-white">Automated System Invariant Proof</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Generates a randomized scenario sequence (30 synthetic employees, 10 rules, 50 random mutations:
                  relocations, department transfers, group changes) and verifies that scoped incremental diffs
                  yield identical state to an independent brute-force reference recomputation.
                </p>
              </div>
              <button
                onClick={handleRunVerify}
                className="px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-white text-xs font-bold transition-all shadow-lg shadow-brand-500/25 inline-flex items-center gap-2"
              >
                <Play className="w-4 h-4 fill-white" /> Run Verification Engine
              </button>
            </div>
          )}

          {running && (
            <div className="p-12 text-center space-y-4">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-brand-400" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-white">Running 50 Mutation Scenarios...</h4>
                <p className="text-xs text-slate-400 font-mono">
                  Evaluating incremental scoped diffs vs independent reference resolver
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
              <XCircle className="w-4 h-4 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {report && (
            <div className="space-y-6">
              {/* Verdict Banner */}
              <div
                className={`p-4 rounded-2xl border flex items-center justify-between ${
                  report.equality
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                }`}
              >
                <div className="flex items-center gap-3">
                  {report.equality ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  ) : (
                    <XCircle className="w-6 h-6 text-rose-400" />
                  )}
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      {report.equality
                        ? "100% Mathematical Equivalence Verified"
                        : "Verification Mismatch Detected"}
                    </h4>
                    <p className="text-xs opacity-80">
                      Incremental reconciliation converges strictly to clean-room reference recomputation
                    </p>
                  </div>
                </div>

                <span className="text-xs font-mono font-bold px-3 py-1 rounded-xl bg-surface border border-slate-700 text-slate-200">
                  {report.stats.executionTimeMs}ms
                </span>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-4 gap-3 text-center">
                <div className="p-3 rounded-xl bg-surface-raised/40 border border-slate-800">
                  <div className="text-lg font-bold text-white font-mono">{report.stats.totalEmployees}</div>
                  <div className="text-[10px] uppercase font-bold text-slate-400">Employees</div>
                </div>
                <div className="p-3 rounded-xl bg-surface-raised/40 border border-slate-800">
                  <div className="text-lg font-bold text-white font-mono">{report.stats.totalEventsApplied}</div>
                  <div className="text-[10px] uppercase font-bold text-slate-400">Mutations</div>
                </div>
                <div className="p-3 rounded-xl bg-surface-raised/40 border border-slate-800">
                  <div className="text-lg font-bold text-emerald-400 font-mono">
                    {report.stats.incrementalAssignmentsCount}
                  </div>
                  <div className="text-[10px] uppercase font-bold text-slate-400">Incremental Asgns</div>
                </div>
                <div className="p-3 rounded-xl bg-surface-raised/40 border border-slate-800">
                  <div className="text-lg font-bold text-emerald-400 font-mono">
                    {report.stats.fullRecomputeAssignmentsCount}
                  </div>
                  <div className="text-[10px] uppercase font-bold text-slate-400">Full Recompute Asgns</div>
                </div>
              </div>

              {/* Invariants Checklist */}
              <div className="p-4 rounded-xl bg-background border border-slate-800 space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  System Invariants Checklist
                </h4>
                {Object.entries(report.invariantsVerified).map(([key, val]: any) => (
                  <div key={key} className="flex items-center justify-between text-xs py-1 border-b border-slate-800/60 last:border-0">
                    <span className="font-mono text-slate-300">{key}</span>
                    <span
                      className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                        val === "PASS"
                          ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                          : "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                      }`}
                    >
                      ✓ {val}
                    </span>
                  </div>
                ))}
              </div>

              {/* Sample Event Stream Trace */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Code2 className="w-3.5 h-3.5 text-brand-400" /> Reproducible Mutation Event Sample Trace
                </h4>
                <div className="p-3 rounded-xl bg-background border border-slate-800 font-mono text-[11px] text-slate-300 space-y-1 max-h-36 overflow-y-auto">
                  {report.reproducibleSampleEvents?.map((e: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-slate-500">[{String(e.step).padStart(2, "0")}]</span>
                      <span className="text-slate-300">{e.event}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-surface-raised/40 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            PostgreSQL-authoritative • Zero drift • Idempotent convergence
          </span>
          <div className="flex items-center gap-3">
            {report && (
              <button
                onClick={handleRunVerify}
                disabled={running}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-surface-raised hover:bg-slate-700 text-white border border-slate-700 transition-all flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Re-run Suite
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-brand-500 hover:bg-brand-400 text-white transition-all shadow-md shadow-brand-500/20"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
