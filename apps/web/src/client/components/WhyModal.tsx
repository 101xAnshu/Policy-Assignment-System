import React, { useEffect, useState } from "react";
import { fetchWhy } from "../api";
import { X, CheckCircle2, XCircle, AlertTriangle, ShieldCheck, ArrowRight } from "lucide-react";

interface WhyModalProps {
  employeeId: string;
  employeeName: string;
  policyId: string;
  policyName?: string;
  date: string;
  onClose: () => void;
}

export const WhyModal: React.FC<WhyModalProps> = ({
  employeeId,
  employeeName,
  policyId,
  policyName,
  date,
  onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    fetchWhy(employeeId, policyId, date)
      .then((res) => {
        if (isMounted) setData(res);
      })
      .catch((err) => {
        if (isMounted) setError(err.message);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [employeeId, policyId, date]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ASSIGNED":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" /> Assigned (Active)
          </span>
        );
      case "OVERRIDDEN":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertTriangle className="w-3.5 h-3.5" /> Overridden by Priority
          </span>
        );
      case "NO_MATCH":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-700/50 text-slate-400 border border-slate-600">
            <XCircle className="w-3.5 h-3.5" /> No Rule Match
          </span>
        );
      case "AMBIGUOUS":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertTriangle className="w-3.5 h-3.5" /> Ambiguous Conflict
          </span>
        );
      default:
        return <span className="text-xs text-slate-400">{status}</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface border border-slate-700/80 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-surface-raised/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                Policy Explainability Inspector
              </h3>
              <p className="text-xs text-slate-400">
                Reasoning why <span className="text-brand-400 font-medium">{employeeName}</span> has or does not have policy at <span className="font-mono text-slate-300">{date}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mb-3"></div>
              <p className="text-sm">Evaluating policy rules and dependencies...</p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
              {error}
            </div>
          )}

          {data && (
            <>
              {/* Target Policy Banner */}
              <div className="p-4 rounded-xl bg-surface-raised border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                    {data.targetPolicy.categoryName} ({data.targetPolicy.cardinality})
                  </span>
                  <h4 className="text-base font-bold text-white mt-0.5">
                    {data.targetPolicy.name}
                  </h4>
                </div>
                <div>{getStatusBadge(data.status)}</div>
              </div>

              {/* Plain language explanation */}
              <div className="p-4 rounded-xl bg-brand-950/30 border border-brand-800/40 text-slate-200 text-sm leading-relaxed">
                <span className="text-xs font-bold text-brand-400 uppercase tracking-wider block mb-1">
                  Deterministic Resolution Explanation
                </span>
                {data.reason}
              </div>

              {/* Rules Evaluation Breakdown */}
              <div>
                <h5 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Evaluated Rules Breakdown ({data.ruleEvaluations.length})
                </h5>
                <div className="space-y-3">
                  {data.ruleEvaluations.map((rule: any) => (
                    <div
                      key={rule.ruleId}
                      className={`p-4 rounded-xl border transition-all ${
                        rule.outcome === "WINNER"
                          ? "bg-emerald-950/20 border-emerald-500/30"
                          : rule.outcome === "OVERRIDDEN"
                          ? "bg-amber-950/20 border-amber-500/30"
                          : "bg-surface-raised/40 border-slate-800"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-sm">
                            {rule.ruleName}
                          </span>
                          <span className="text-xs font-mono text-slate-400">
                            v{rule.ruleVersion}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                            Priority: {rule.priority}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded font-bold ${
                              rule.outcome === "WINNER"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : rule.outcome === "OVERRIDDEN"
                                ? "bg-amber-500/20 text-amber-400"
                                : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {rule.outcome}
                          </span>
                        </div>
                      </div>

                      {/* Conditions */}
                      <div className="space-y-1.5 mt-3 pt-2 border-t border-slate-800/80 text-xs">
                        {rule.matchedConditions.map((cond: string, idx: number) => (
                          <div key={idx} className="flex items-center gap-2 text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>{cond}</span>
                          </div>
                        ))}
                        {rule.failedConditions.map((cond: string, idx: number) => (
                          <div key={idx} className="flex items-center gap-2 text-rose-400">
                            <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>{cond}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-surface-raised/40 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
