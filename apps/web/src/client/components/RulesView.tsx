import React, { useState, useEffect } from "react";
import {
  fetchRules,
  fetchPolicies,
  fetchCategories,
  createRule,
  createRuleVersion,
  fetchRuleDetail,
  publishRule,
  previewRuleImpact,
  previewRuleVersionImpact,
} from "../api";
import {
  FileText,
  Plus,
  Search,
  Users,
  RefreshCw,
  X,
  Eye,
} from "lucide-react";
import { useModalBehavior } from "../useModalBehavior";

export const RulesView: React.FC = () => {
  const [rules, setRules] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [filterCat, setFilterCat] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [ruleName, setRuleName] = useState<string>("");
  const [selectedCatId, setSelectedCatId] = useState<string>("");
  const [selectedPolId, setSelectedPolId] = useState<string>("");
  const [priority, setPriority] = useState<number>(50);
  const [field, setField] = useState<string>("state");
  const [fieldVal, setFieldVal] = useState<string>("California");
  const [effectiveFrom, setEffectiveFrom] = useState<string>("2024-08-28");
  const [creating, setCreating] = useState<boolean>(false);

  // Impact preview modal
  const [showImpactModal, setShowImpactModal] = useState<boolean>(false);
  const [impactData, setImpactData] = useState<any | null>(null);
  const [loadingImpact, setLoadingImpact] = useState<boolean>(false);
  const [publishingRuleId, setPublishingRuleId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<boolean>(false);

  // New-version (edit lifecycle) modal — constrained grammar:
  // single EQUALS condition or ALL (everyone). No OR/NOT, no DSL.
  const [showVersionModal, setShowVersionModal] = useState<boolean>(false);
  const [editingRule, setEditingRule] = useState<any | null>(null);
  const [versionPredicateType, setVersionPredicateType] = useState<"EQUALS" | "ALL">("EQUALS");
  const [versionField, setVersionField] = useState<string>("state");
  const [versionFieldVal, setVersionFieldVal] = useState<string>("California");
  const [versionPriority, setVersionPriority] = useState<number>(50);
  const [versionEffectiveFrom, setVersionEffectiveFrom] = useState<string>("2024-08-28");
  const [savingVersion, setSavingVersion] = useState<boolean>(false);
  const [versionError, setVersionError] = useState<string | null>(null);

  // Version history modal (v1 + v2 inspection via GET /:id).
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [historyData, setHistoryData] = useState<any | null>(null);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  useModalBehavior(() => setShowCreateModal(false), showCreateModal);
  useModalBehavior(() => setShowImpactModal(false), showImpactModal && !publishing);
  useModalBehavior(() => setShowVersionModal(false), showVersionModal);
  useModalBehavior(() => setShowHistoryModal(false), showHistoryModal);

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
    if (!ruleName || !selectedCatId || !selectedPolId) return;
    setCreating(true);
    try {
      const predicate = { type: "EQUALS", field, value: fieldVal };
      const companyId = rules[0]?.companyId ?? "a0000000-0000-0000-0000-000000000001";
      await createRule({ companyId, categoryId: selectedCatId, policyId: selectedPolId, name: ruleName, priority: Number(priority), predicate, effectiveFrom });
      await loadData();
      setShowCreateModal(false);
    } catch (err: any) {
      console.error("Failed to create rule:", err.message);
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
      const preview = await previewRuleVersionImpact(rule.id, { effectiveFrom: "2024-08-28" });
      setImpactData(preview);
    } catch (err: any) {
      console.error("Failed to preview rule impact:", err.message);
      setShowImpactModal(false);
    } finally {
      setLoadingImpact(false);
    }
  };

  const handleConfirmPublish = async () => {
    if (!publishingRuleId) return;
    setPublishing(true);
    try {
      // Publish the explicit latest version so the lifecycle is
      // create-version → preview → publish(version) end-to-end.
      const detail = await fetchRuleDetail(publishingRuleId);
      const latestVersion = (detail.versions ?? []).reduce(
        (m: number, v: any) => Math.max(m, v.version),
        0,
      );
      await publishRule(
        publishingRuleId,
        "2024-08-28",
        latestVersion > 0 ? latestVersion : undefined,
      );
      await loadData();
      setShowImpactModal(false);
    } catch (err: any) {
      console.error("Failed to publish rule:", err.message);
    } finally {
      setPublishing(false);
    }
  };

  const handleOpenNewVersion = async (rule: any) => {
    setEditingRule(rule);
    setVersionError(null);
    try {
      const detail = await fetchRuleDetail(rule.id);
      const latest = (detail.versions ?? []).sort((a: any, b: any) => b.version - a.version)[0];
      if (latest?.predicate?.type === "EQUALS") {
        setVersionPredicateType("EQUALS");
        setVersionField(latest.predicate.field ?? "state");
        setVersionFieldVal(latest.predicate.value ?? "");
      } else if (latest?.predicate?.type === "ALL" && (latest.predicate.children ?? []).length === 0) {
        setVersionPredicateType("ALL");
      } else if (latest?.predicate?.type === "ALL" && latest.predicate.children?.length === 1 && latest.predicate.children[0]?.type === "EQUALS") {
        // Single-condition ALL wrapper: flatten for the constrained editor.
        setVersionPredicateType("EQUALS");
        setVersionField(latest.predicate.children[0].field ?? "state");
        setVersionFieldVal(latest.predicate.children[0].value ?? "");
      } else {
        setVersionPredicateType("EQUALS");
      }
      setVersionPriority(latest?.priority ?? 50);
      setVersionEffectiveFrom(latest?.effectiveFrom ?? "2024-08-28");
    } catch {
      setVersionPredicateType("EQUALS");
    }
    setShowVersionModal(true);
  };

  const handleSaveVersion = async () => {
    if (!editingRule) return;
    setSavingVersion(true);
    setVersionError(null);
    try {
      const predicate =
        versionPredicateType === "ALL"
          ? { type: "ALL", children: [] as any[] }
          : { type: "EQUALS", field: versionField, value: versionFieldVal };
      await createRuleVersion(editingRule.id, {
        predicate,
        priority: Number(versionPriority),
        effectiveFrom: versionEffectiveFrom,
      });
      await loadData();
      setShowVersionModal(false);
    } catch (err: any) {
      setVersionError(err.message);
    } finally {
      setSavingVersion(false);
    }
  };

  const handleOpenHistory = async (rule: any) => {
    setShowHistoryModal(true);
    setLoadingHistory(true);
    setHistoryData(null);
    try {
      const detail = await fetchRuleDetail(rule.id);
      setHistoryData(detail);
    } catch (err: any) {
      console.error("Failed to fetch rule history:", err.message);
      setShowHistoryModal(false);
    } finally {
      setLoadingHistory(false);
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

  const inputClass = "w-full bg-background border border-border rounded px-3 py-2 text-sm text-primary focus:outline-none focus:border-accent transition-colors";
  const labelClass = "block text-xs font-medium text-secondary mb-1.5";

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-lg font-semibold text-primary flex items-center gap-2">
            <FileText className="w-5 h-5 text-secondary" /> Assignment rules
          </h1>
          <p className="text-xs text-secondary mt-0.5">
            Rule registry with priority ordering and immutable versioning
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-tertiary absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search rules..."
              className="bg-surface border border-border rounded pl-8 pr-3 py-1.5 text-[13px] text-primary placeholder-tertiary focus:outline-none focus:border-accent w-56"
            />
          </div>
          <button
            onClick={handleOpenCreate}
            className="px-3 py-1.5 rounded bg-accent hover:bg-accent-500 text-white text-[13px] font-medium flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Create rule
          </button>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-1 overflow-x-auto text-[13px]">
        <button
          onClick={() => setFilterCat("ALL")}
          className={`px-2.5 py-1 rounded transition-colors ${
            filterCat === "ALL" ? "bg-accent text-white" : "text-secondary hover:text-primary hover:bg-surface-raised"
          }`}
        >
          All ({rules.length})
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setFilterCat(c.id)}
            className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1 ${
              filterCat === c.id ? "bg-accent text-white" : "text-secondary hover:text-primary hover:bg-surface-raised"
            }`}
          >
            {c.name}
            <span className="text-[10px] opacity-70 font-mono">({c.cardinality})</span>
          </button>
        ))}
      </div>

      {/* Rules table */}
      <div className="flex-1 bg-surface border border-border rounded overflow-hidden flex flex-col">
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-left text-[13px]">
            <thead className="sticky top-0 bg-surface-raised border-b border-border text-secondary text-xs">
              <tr>
                <th className="p-3 font-medium">Rule</th>
                <th className="p-3 font-medium">Category</th>
                <th className="p-3 font-medium">Policy</th>
                <th className="p-3 text-center font-medium">Priority</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filteredRules.map((rule) => (
                <tr key={rule.id} className="hover:bg-surface-raised/50 transition-colors">
                  <td className="p-3">
                    <div className="font-medium text-primary">{rule.name}</div>
                    <div className="text-[11px] text-tertiary font-mono mt-0.5">{rule.id}</div>
                  </td>
                  <td className="p-3">
                    <span className="text-primary">{rule.categoryName}</span>
                    <span className="ml-1 text-[10px] font-mono text-tertiary px-1 py-0.5 rounded bg-surface-raised border border-border">
                      {rule.cardinality}
                    </span>
                  </td>
                  <td className="p-3 text-accent">{rule.policyName}</td>
                  <td className="p-3 text-center">
                    <span className="font-mono text-primary px-2 py-0.5 rounded bg-surface-raised border border-border text-xs">
                      {rule.priority ?? 50}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                      rule.status === "ACTIVE"
                        ? "bg-status-success/10 text-status-success"
                        : "bg-status-warning/10 text-status-warning"
                    }`}>
                      {rule.status} {rule.currentVersion ? `v${rule.currentVersion}` : "(Draft)"}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => handleOpenNewVersion(rule)}
                        className="px-2.5 py-1 text-xs font-medium rounded bg-surface-raised hover:bg-surface-highlight text-primary border border-border transition-colors"
                      >
                        New version
                      </button>
                      <button
                        onClick={() => handleOpenHistory(rule)}
                        className="px-2.5 py-1 text-xs font-medium rounded bg-surface-raised hover:bg-surface-highlight text-primary border border-border transition-colors"
                      >
                        History
                      </button>
                      <button
                        onClick={() => handlePreviewPublish(rule)}
                        className="px-2.5 py-1 text-xs font-medium rounded bg-surface-raised hover:bg-surface-highlight text-primary border border-border transition-colors inline-flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3 text-secondary" /> Preview impact
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Impact preview modal */}
      {showImpactModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => { if (!publishing) setShowImpactModal(false); }}
        >
          <div
            className="w-full max-w-xl bg-surface border border-border rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-heading text-[15px] font-semibold text-primary">Rule impact preview</h3>
                <p className="text-xs text-secondary mt-0.5">Simulated impact before publishing</p>
              </div>
              <button onClick={() => setShowImpactModal(false)} className="text-secondary hover:text-primary p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {loadingImpact ? (
                <div className="py-10 text-center text-secondary space-y-2">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto text-accent" />
                  <p className="text-xs">Running simulation...</p>
                </div>
              ) : impactData ? (
                <div className="space-y-4">
                  {/* Summary */}
                  <div className="grid grid-cols-4 gap-2">
                    <div className="p-3 rounded bg-status-success/5 border border-status-success/15 text-center">
                      <div className="text-lg font-heading font-semibold text-status-success">+{impactData.summary.newlyAssignedCount}</div>
                      <div className="text-[11px] text-secondary">Assigned</div>
                    </div>
                    <div className="p-3 rounded bg-status-error/5 border border-status-error/15 text-center">
                      <div className="text-lg font-heading font-semibold text-status-error">-{impactData.summary.revokedCount}</div>
                      <div className="text-[11px] text-secondary">Removed</div>
                    </div>
                    <div className="p-3 rounded bg-status-warning/5 border border-status-warning/15 text-center">
                      <div className="text-lg font-heading font-semibold text-status-warning">~{impactData.summary.changedCount}</div>
                      <div className="text-[11px] text-secondary">Changed</div>
                    </div>
                    <div className="p-3 rounded bg-surface-raised border border-border text-center">
                      <div className="text-lg font-heading font-semibold text-primary">{impactData.summary.unchangedCount}</div>
                      <div className="text-[11px] text-secondary">Unchanged</div>
                    </div>
                  </div>

                  {/* Affected employees */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-secondary flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      {impactData.summary.affectedEmployeesCount} employees affected
                    </h4>
                    {impactData.affectedEmployees?.length === 0 ? (
                      <div className="p-3 rounded bg-background border border-border text-xs text-tertiary">
                        No employees affected.
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {impactData.affectedEmployees.map((emp: any, i: number) => (
                          <div key={i} className="p-3 rounded bg-background border border-border flex items-center justify-between text-xs">
                            <div>
                              <span className="font-medium text-primary">{emp.name}</span>
                              <p className="text-tertiary mt-0.5">{emp.department}</p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {emp.added?.map((a: any, idx: number) => (
                                <span key={idx} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-status-success/10 text-status-success">
                                  +{a.policyName}
                                </span>
                              ))}
                              {emp.revoked?.map((r: any, idx: number) => (
                                <span key={idx} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-status-error/10 text-status-error">
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

            <div className="px-5 py-3 border-t border-border flex items-center justify-between">
              <span className="text-xs text-tertiary">Publishing triggers reconciliation</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowImpactModal(false)} className="px-3 py-1.5 rounded text-[13px] font-medium text-secondary hover:text-primary">
                  Cancel
                </button>
                <button
                  onClick={handleConfirmPublish}
                  disabled={publishing || loadingImpact}
                  className="px-3 py-1.5 rounded text-[13px] font-medium bg-accent hover:bg-accent-500 text-white transition-colors"
                >
                  {publishing ? "Publishing..." : "Confirm & publish"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create rule modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowCreateModal(false)}>
          <div
            className="w-full max-w-lg bg-surface border border-border rounded-lg shadow-xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h3 className="font-heading text-[15px] font-semibold text-primary">Create rule</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-secondary hover:text-primary p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className={labelClass}>Rule name</label>
                <input type="text" value={ruleName} onChange={(e) => setRuleName(e.target.value)} placeholder="e.g. California Vacation Rule" className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Category</label>
                  <select value={selectedCatId} onChange={(e) => setSelectedCatId(e.target.value)} className={inputClass}>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.cardinality})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Target policy</label>
                  <select value={selectedPolId} onChange={(e) => setSelectedPolId(e.target.value)} className={inputClass}>
                    {policies.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Predicate field</label>
                  <select value={field} onChange={(e) => setField(e.target.value)} className={inputClass}>
                    <option value="state">state</option>
                    <option value="country">country</option>
                    <option value="department">department</option>
                    <option value="employmentType">employmentType</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Field value</label>
                  <input type="text" value={fieldVal} onChange={(e) => setFieldVal(e.target.value)} placeholder="e.g. California" className={inputClass} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Priority</label>
                  <input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Effective from</label>
                  <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className={`${inputClass} font-mono`} />
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
              <button onClick={() => setShowCreateModal(false)} className="px-3 py-1.5 rounded text-[13px] font-medium text-secondary hover:text-primary">
                Cancel
              </button>
              <button
                onClick={handleCreateDraft}
                disabled={creating || !ruleName.trim()}
                className="px-3 py-1.5 rounded text-[13px] font-medium bg-accent hover:bg-accent-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? "Creating..." : "Save as draft"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New version modal (edit lifecycle: draft vN+1, then preview → publish) */}
      {showVersionModal && editingRule && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowVersionModal(false)}>
          <div
            className="w-full max-w-lg bg-surface border border-border rounded-lg shadow-xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-heading text-[15px] font-semibold text-primary">New version — {editingRule.name}</h3>
                <p className="text-xs text-secondary mt-0.5">Drafts vN+1 without changing live assignments until publish</p>
              </div>
              <button onClick={() => setShowVersionModal(false)} className="text-secondary hover:text-primary p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className={labelClass}>Predicate</label>
                <select value={versionPredicateType} onChange={(e) => setVersionPredicateType(e.target.value as "EQUALS" | "ALL")} className={inputClass}>
                  <option value="EQUALS">Field equals</option>
                  <option value="ALL">All employees</option>
                </select>
              </div>
              {versionPredicateType === "EQUALS" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Field</label>
                    <select value={versionField} onChange={(e) => setVersionField(e.target.value)} className={inputClass}>
                      <option value="state">state</option>
                      <option value="country">country</option>
                      <option value="department">department</option>
                      <option value="employmentType">employmentType</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Value</label>
                    <input type="text" value={versionFieldVal} onChange={(e) => setVersionFieldVal(e.target.value)} className={inputClass} />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Priority</label>
                  <input type="number" value={versionPriority} onChange={(e) => setVersionPriority(Number(e.target.value))} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Effective from</label>
                  <input type="date" value={versionEffectiveFrom} onChange={(e) => setVersionEffectiveFrom(e.target.value)} className={`${inputClass} font-mono`} />
                </div>
              </div>
              {versionError && (
                <div className="p-3 rounded bg-status-error/10 border border-status-error/20 text-xs text-status-error">
                  {versionError}
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
              <button onClick={() => setShowVersionModal(false)} className="px-3 py-1.5 rounded text-[13px] font-medium text-secondary hover:text-primary">
                Cancel
              </button>
              <button
                onClick={handleSaveVersion}
                disabled={savingVersion || (versionPredicateType === "EQUALS" && !versionFieldVal.trim())}
                className="px-3 py-1.5 rounded text-[13px] font-medium bg-accent hover:bg-accent-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingVersion ? "Saving..." : "Save new draft version"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Version history modal (v1 + v2 inspection) */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowHistoryModal(false)}>
          <div
            className="w-full max-w-lg bg-surface border border-border rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-heading text-[15px] font-semibold text-primary">Version history</h3>
                <p className="text-xs text-secondary mt-0.5">{historyData?.name ?? "Loading..."}</p>
              </div>
              <button onClick={() => setShowHistoryModal(false)} className="text-secondary hover:text-primary p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              {loadingHistory ? (
                <div className="py-8 text-center text-secondary text-xs">Loading versions...</div>
              ) : (
                <div className="space-y-2">
                  {(historyData?.versions ?? []).map((v: any) => (
                    <div key={v.id} className="p-3 rounded bg-background border border-border text-xs flex items-center justify-between">
                      <div>
                        <span className="font-mono font-medium text-primary">v{v.version}</span>
                        <span className="ml-2 text-secondary">priority {v.priority}</span>
                        <p className="text-tertiary mt-1 font-mono">{JSON.stringify(v.predicate)}</p>
                        <p className="text-tertiary mt-0.5">effective {v.effectiveFrom}</p>
                      </div>
                      {historyData?.currentVersion === v.version && historyData?.status === "ACTIVE" ? (
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-status-success/10 text-status-success">live</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-surface-raised text-tertiary border border-border">draft/history</span>
                      )}
                    </div>
                  ))}
                  {(historyData?.versions ?? []).length === 0 && (
                    <div className="text-xs text-tertiary">No versions found.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
