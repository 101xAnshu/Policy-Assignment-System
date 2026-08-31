import React, { useState, useEffect } from "react";
import {
  fetchRules,
  fetchPolicies,
  fetchCategories,
  createRule,
  publishRule,
  previewRuleImpact,
  previewRuleVersionImpact,
} from "../api";
import {
  FileText,
  Plus,
  Send,
  Layers,
  Code,
  CheckCircle2,
  AlertCircle,
  Tag,
  Search,
  Sparkles,
  Users,
  PlusCircle,
  MinusCircle,
  RefreshCw,
  X,
  Check,
} from "lucide-react";

export const RulesView: React.FC = () => {
  const [rules, setRules] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [filterCat, setFilterCat] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Create Modal state
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [ruleName, setRuleName] = useState<string>("");
  const [selectedCatId, setSelectedCatId] = useState<string>("");
  const [selectedPolId, setSelectedPolId] = useState<string>("");
  const [priority, setPriority] = useState<number>(50);
  const [field, setField] = useState<string>("state");
  const [fieldVal, setFieldVal] = useState<string>("California");
  const [effectiveFrom, setEffectiveFrom] = useState<string>("2024-08-28");
  const [creating, setCreating] = useState<boolean>(false);

  // Impact Preview Modal state (§34)
  const [showImpactModal, setShowImpactModal] = useState<boolean>(false);
  const [impactData, setImpactData] = useState<any | null>(null);
  const [loadingImpact, setLoadingImpact] = useState<boolean>(false);
  const [publishingRuleId, setPublishingRuleId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<boolean>(false);

  const loadData = async () => {
    const [rData, pData, cData] = await Promise.all([
      fetchRules(),
      fetchPolicies(),
      fetchCategories(),
    ]);
    setRules(rData);
    setPolicies(pData);
    setCategories(cData);
    if (cData.length > 0 && !selectedCatId) setSelectedCatId(cData[0].id);
    if (pData.length > 0 && !selectedPolId) setSelectedPolId(pData[0].id);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenCreate = () => {
    setRuleName("");
    if (categories.length > 0) setSelectedCatId(categories[0].id);
    if (policies.length > 0) setSelectedPolId(policies[0].id);
    setPriority(50);
    setField("state");
    setFieldVal("California");
    setEffectiveFrom("2024-08-28");
    setShowCreateModal(true);
  };

  const handleCreateDraft = async () => {
    if (!ruleName || !selectedCatId || !selectedPolId) {
      alert("Please fill in all required fields.");
      return;
    }

    setCreating(true);
    try {
      const predicate = {
        type: "EQUALS",
        field,
        value: fieldVal,
      };

      const companyId = rules[0]?.companyId ?? "a0000000-0000-0000-0000-000000000001";

      await createRule({
        companyId,
        categoryId: selectedCatId,
        policyId: selectedPolId,
        name: ruleName,
        priority: Number(priority),
        predicate,
        effectiveFrom,
      });

      await loadData();
      setShowCreateModal(false);
    } catch (err: any) {
      alert("Failed to create rule: " + err.message);
    } finally {
      setCreating(false);
    }
  };

  const handlePreviewPublish = async (rule: any) => {
    setPublishingRuleId(rule.id);
    setShowImpactModal(true);
    setLoadingImpact(true);
    setImpactData(null);

    try {
      const preview = await previewRuleVersionImpact(rule.id, {
        effectiveFrom: "2024-08-28",
      });
      setImpactData(preview);
    } catch (err: any) {
      alert("Failed to preview rule impact: " + err.message);
      setShowImpactModal(false);
    } finally {
      setLoadingImpact(false);
    }
  };

  const handleConfirmPublish = async () => {
    if (!publishingRuleId) return;
    setPublishing(true);
    try {
      await publishRule(publishingRuleId, "2024-08-28");
      await loadData();
      setShowImpactModal(false);
    } catch (err: any) {
      alert("Failed to publish rule: " + err.message);
    } finally {
      setPublishing(false);
    }
  };

  const filteredRules = rules.filter((r) => {
    const matchCat = filterCat === "ALL" || r.categoryId === filterCat;
    const matchSearch =
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.categoryName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.policyName?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-brand-400" /> Assignment Rules Matrix
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Deterministic rule registry with priority ordering and immutable versioning
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search rules or policies..."
              className="bg-surface border border-slate-800 rounded-xl pl-9 pr-3.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 w-64"
            />
          </div>

          <button
            onClick={handleOpenCreate}
            className="px-3.5 py-1.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-brand-500/20"
          >
            <Plus className="w-3.5 h-3.5" /> Create Draft Rule
          </button>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setFilterCat("ALL")}
          className={`px-3 py-1.5 rounded-lg transition-all font-medium ${
            filterCat === "ALL"
              ? "bg-brand-500 text-white"
              : "bg-surface/60 text-slate-400 hover:bg-surface hover:text-white"
          }`}
        >
          All Categories ({rules.length})
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setFilterCat(c.id)}
            className={`px-3 py-1.5 rounded-lg transition-all font-medium flex items-center gap-1.5 ${
              filterCat === c.id
                ? "bg-brand-500 text-white"
                : "bg-surface/60 text-slate-400 hover:bg-surface hover:text-white"
            }`}
          >
            <span>{c.name}</span>
            <span className="text-[10px] opacity-70 font-mono">({c.cardinality})</span>
          </button>
        ))}
      </div>

      {/* Rules Table */}
      <div className="flex-1 bg-surface/40 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-surface border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
              <tr>
                <th className="p-3.5">Rule Name</th>
                <th className="p-3.5">Category</th>
                <th className="p-3.5">Target Policy</th>
                <th className="p-3.5 text-center">Priority</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredRules.map((rule) => (
                <tr key={rule.id} className="hover:bg-surface-raised/40 transition-colors">
                  <td className="p-3.5">
                    <div className="font-semibold text-white">{rule.name}</div>
                    <div className="text-[11px] text-slate-400 font-mono">ID: {rule.id}</div>
                  </td>
                  <td className="p-3.5">
                    <span className="font-medium text-slate-300">{rule.categoryName}</span>
                    <span className="ml-1.5 text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                      {rule.cardinality}
                    </span>
                  </td>
                  <td className="p-3.5 font-semibold text-brand-300">{rule.policyName}</td>
                  <td className="p-3.5 text-center">
                    <span className="font-mono font-bold px-2 py-0.5 rounded bg-surface border border-slate-700 text-slate-200">
                      {rule.priority ?? 50}
                    </span>
                  </td>
                  <td className="p-3.5">
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                        rule.status === "ACTIVE"
                          ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                      }`}
                    >
                      {rule.status} {rule.currentVersion ? `v${rule.currentVersion}` : "(Draft)"}
                    </span>
                  </td>
                  <td className="p-3.5 text-right">
                    <button
                      onClick={() => handlePreviewPublish(rule)}
                      className="px-3 py-1 text-xs font-semibold rounded-lg bg-surface-raised hover:bg-slate-700 text-white border border-slate-700 transition-all inline-flex items-center gap-1.5 shadow-sm"
                    >
                      <Sparkles className="w-3 h-3 text-brand-400" /> Preview Impact (§34)
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rule Impact Preview Modal (§34) */}
      {showImpactModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-surface border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-5 h-5 text-brand-400" />
                <div>
                  <h3 className="text-base font-bold text-white">Rule Impact Preview</h3>
                  <p className="text-xs text-slate-400">
                    Simulated downstream impact across all company employees before publish (§34)
                  </p>
                </div>
              </div>
              <button onClick={() => setShowImpactModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {loadingImpact ? (
                <div className="p-12 text-center text-slate-400 space-y-3">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-brand-400" />
                  <p className="text-xs font-mono">Running simulation across employee population...</p>
                </div>
              ) : impactData ? (
                <div className="space-y-6">
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-4 gap-3">
                    <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                      <div className="text-xl font-bold text-emerald-400">+{impactData.summary.newlyAssignedCount}</div>
                      <div className="text-[10px] uppercase font-bold text-emerald-300/80">Newly Assigned</div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center">
                      <div className="text-xl font-bold text-rose-400">-{impactData.summary.revokedCount}</div>
                      <div className="text-[10px] uppercase font-bold text-rose-300/80">Removed</div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                      <div className="text-xl font-bold text-amber-400">~{impactData.summary.changedCount}</div>
                      <div className="text-[10px] uppercase font-bold text-amber-300/80">Changed</div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700 text-center">
                      <div className="text-xl font-bold text-slate-300">{impactData.summary.unchangedCount}</div>
                      <div className="text-[10px] uppercase font-bold text-slate-400">Unchanged</div>
                    </div>
                  </div>

                  {/* Affected Population Breakdown */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                      <Users className="w-4 h-4 text-brand-400" />
                      {impactData.summary.affectedEmployeesCount} Employees Potentially Affected
                    </h4>

                    {impactData.affectedEmployees?.length === 0 ? (
                      <div className="p-4 rounded-xl bg-background border border-slate-800 text-xs text-slate-400">
                        No employees are affected by this rule activation.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {impactData.affectedEmployees.map((emp: any, i: number) => (
                          <div
                            key={i}
                            className="p-3.5 rounded-xl bg-background border border-slate-800 flex items-center justify-between text-xs"
                          >
                            <div className="space-y-0.5">
                              <span className="font-semibold text-white">{emp.name}</span>
                              <p className="text-[11px] text-slate-400">{emp.department}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {emp.added?.map((a: any, idx: number) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                                >
                                  +{a.policyName}
                                </span>
                              ))}
                              {emp.revoked?.map((r: any, idx: number) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30"
                                >
                                  -{r.policyName}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="p-4 border-t border-slate-800 bg-surface-raised/40 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Publishing is immutable and immediately initiates reconciliation.
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowImpactModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmPublish}
                  disabled={publishing || loadingImpact}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-brand-500 hover:bg-brand-400 text-white transition-all shadow-md shadow-brand-500/20 flex items-center gap-1.5"
                >
                  {publishing ? "Publishing..." : "Confirm & Publish Version"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Draft Rule Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-surface border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Create Assignment Rule</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Rule Name *
                </label>
                <input
                  type="text"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="e.g. California Vacation Policy Rule"
                  className="w-full bg-background border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Category *
                  </label>
                  <select
                    value={selectedCatId}
                    onChange={(e) => setSelectedCatId(e.target.value)}
                    className="w-full bg-background border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.cardinality})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Target Policy *
                  </label>
                  <select
                    value={selectedPolId}
                    onChange={(e) => setSelectedPolId(e.target.value)}
                    className="w-full bg-background border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                  >
                    {policies.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Predicate Field
                  </label>
                  <select
                    value={field}
                    onChange={(e) => setField(e.target.value)}
                    className="w-full bg-background border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="state">state</option>
                    <option value="country">country</option>
                    <option value="department">department</option>
                    <option value="employmentType">employmentType</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Field Value (Equals)
                  </label>
                  <input
                    type="text"
                    value={fieldVal}
                    onChange={(e) => setFieldVal(e.target.value)}
                    placeholder="e.g. California"
                    className="w-full bg-background border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Priority
                  </label>
                  <input
                    type="number"
                    value={priority}
                    onChange={(e) => setPriority(Number(e.target.value))}
                    className="w-full bg-background border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Effective From
                  </label>
                  <input
                    type="date"
                    value={effectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                    className="w-full bg-background border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-surface-raised/40 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDraft}
                disabled={creating}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-brand-500 hover:bg-brand-400 text-white transition-all shadow-md shadow-brand-500/20"
              >
                {creating ? "Creating..." : "Save as Draft"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
