import React, { useEffect, useState } from "react";
import { fetchWhy } from "../api";
import { useModalBehavior } from "../useModalBehavior";
import { X, CheckCircle2, XCircle, AlertTriangle, HelpCircle } from "lucide-react";

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

  useModalBehavior(onClose);

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
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-status-success/10 text-status-success">
            <CheckCircle2 className="w-3 h-3" /> Assigned
          </span>
        );
      case "OVERRIDDEN":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-status-warning/10 text-status-warning">
            <AlertTriangle className="w-3 h-3" /> Overridden
          </span>
        );
      case "NO_MATCH":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-surface-raised text-secondary">
            <XCircle className="w-3 h-3" /> No match
          </span>
        );
      case "AMBIGUOUS":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-status-error/10 text-status-error">
            <AlertTriangle className="w-3 h-3" /> Ambiguous
          </span>
        );
      default:
        return <span className="text-xs text-secondary">{status}</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-lg w-full max-w-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <HelpCircle className="w-5 h-5 text-accent" />
            <div>
              <h3 className="font-heading text-[15px] font-semibold text-primary">
                Policy explanation
              </h3>
              <p className="text-xs text-secondary mt-0.5">
                Why <span className="text-accent">{employeeName}</span> {data?.status === "ASSIGNED" ? "has" : "does not have"} this policy on <span className="font-mono">{date}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-secondary hover:text-primary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 text-secondary">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3"></div>
              <p className="text-sm">Evaluating rules...</p>
            </div>
          )}

          {error && (
            <div className="p-3 rounded bg-status-error/10 border border-status-error/20 text-status-error text-sm">
              {error}
            </div>
          )}

          {data && (
            <>
              {/* Target Policy */}
              <div className="p-4 rounded bg-surface-raised border border-border flex items-center justify-between">
                <div>
                  <span className="text-xs text-secondary">
                    {data.targetPolicy.categoryName} ({data.targetPolicy.cardinality})
                  </span>
                  <h4 className="text-sm font-medium text-primary mt-0.5">
                    {data.targetPolicy.name}
                  </h4>
                </div>
                <div>{getStatusBadge(data.status)}</div>
              </div>

              {/* Explanation */}
              <div className="p-4 rounded bg-accent/5 border border-accent/10 text-primary text-sm leading-relaxed">
                <span className="text-xs font-medium text-accent block mb-1">
                  Resolution explanation
                </span>
                {data.reason}
              </div>

              {/* Rules Breakdown */}
              <div>
                <h5 className="text-xs font-medium text-secondary mb-3">
                  Evaluated rules ({data.ruleEvaluations.length})
                </h5>
                <div className="space-y-2">
                  {data.ruleEvaluations.map((rule: any) => (
                    <div
                      key={rule.ruleId}
                      className={`p-4 rounded border transition-colors ${
                        rule.outcome === "WINNER"
                          ? "bg-status-success/5 border-status-success/15"
                          : rule.outcome === "OVERRIDDEN"
                          ? "bg-status-warning/5 border-status-warning/15"
                          : "bg-surface-raised border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-primary text-sm">
                            {rule.ruleName}
                          </span>
                          <span className="text-xs font-mono text-secondary">
                            v{rule.ruleVersion}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono px-2 py-0.5 rounded bg-surface-raised border border-border text-secondary">
                            P{rule.priority}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded font-medium ${
                              rule.outcome === "WINNER"
                                ? "bg-status-success/10 text-status-success"
                                : rule.outcome === "OVERRIDDEN"
                                ? "bg-status-warning/10 text-status-warning"
                                : "bg-surface-raised text-secondary"
                            }`}
                          >
                            {rule.outcome}
                          </span>
                        </div>
                      </div>

                      {/* Conditions */}
                      <div className="space-y-1 mt-2 pt-2 border-t border-border/50 text-xs">
                        {rule.matchedConditions.map((cond: string, idx: number) => (
                          <div key={idx} className="flex items-center gap-2 text-status-success">
                            <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                            <span>{cond}</span>
                          </div>
                        ))}
                        {rule.failedConditions.map((cond: string, idx: number) => (
                          <div key={idx} className="flex items-center gap-2 text-status-error">
                            <XCircle className="w-3 h-3 flex-shrink-0" />
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
        <div className="px-5 py-3 border-t border-border flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[13px] font-medium text-secondary hover:text-primary bg-surface-raised hover:bg-surface-highlight rounded border border-border transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
