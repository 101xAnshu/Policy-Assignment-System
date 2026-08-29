import React, { useState, useEffect } from "react";
import { fetchRules, fetchPolicies, fetchCategories, createRule, publishRule } from "../api";
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
} from "lucide-react";

export const RulesView: React.FC = () => {
  const [rules, setRules] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [filterCat, setFilterCat] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Create Modal
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [ruleName, setRuleName] = useState<string>("");
  const [ruleDesc, setRuleDesc] = useState<string>("");
  const [selectedCatId, setSelectedCatId] = useState<string>("");
  const [selectedPolId, setSelectedPolId] = useState<string>("");
  const [priority, setPriority] = useState<number>(10);
  const [field, setField] = useState<string>("state");
  const [fieldVal, setFieldVal] = useState<string>("California");
  const [creating, setCreating] = useState<boolean>(false);

  const loadData = async () => {
    const [rData, pData, cData] = await Promise.all([
      fetchRules(),
      fetchPolicies(),
      fetchCategories(),
    ]);
    setRules(rData);
    setPolicies(pData);
    setCategories(cData);
    if (cData.length > 0) setSelectedCatId(cData[0].id);
    if (pData.length > 0) setSelectedPolId(pData[0].id);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateDraft = async () => {
    setCreating(true);
    try {
      const predicate = {
        type: "EQUALS",
        field,
        value: fieldVal,
      };

      await createRule({
        categoryId: selectedCatId,
        name: ruleName || "Custom Assignment Rule",
        description: ruleDesc,
        targetPolicyId: selectedPolId,
        priority: Number(priority),
        predicate,
      });

      await loadData();
      setShowCreateModal(false);
    } catch (err: any) {
      alert("Failed to create rule: " + err.message);
    } finally {
      setCreating(false);
    }
  };

  const handlePublish = async (ruleId: string) => {
    const validFrom = prompt("Enter effective date (YYYY-MM-DD):", "2024-08-28");
    if (!validFrom) return;
    try {
      await publishRule(ruleId, validFrom);
      await loadData();
    } catch (err: any) {
      alert("Failed to publish rule: " + err.message);
    }
  };

  const filteredRules = rules.filter((r) => {
    const matchCat = filterCat === "ALL" || r.categoryId === filterCat;
    const matchSearch =
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.categoryName?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2.5">
            <FileText className="w-6 h-6 text-brand-400" /> Assignment Rules Matrix
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Deterministic predicate rules evaluated across employee valid-time attributes and group memberships.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-brand-500 hover:bg-brand-600 text-white shadow-lg shadow-brand-500/20 transition-colors"
        >
          <Plus className="w-4 h-4" /> Create Draft Rule
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-4 bg-surface/60 border border-slate-800 p-3 rounded-2xl">
        <div className="flex items-center gap-2 bg-surface-raised border border-slate-700 px-3 py-1.5 rounded-xl flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search rules..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none w-full"
          />
        </div>

        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-brand-400" />
          <span className="text-xs text-slate-400 font-semibold">Category:</span>
          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            className="bg-surface-raised border border-slate-700 text-white text-xs rounded-xl px-3 py-1.5 focus:outline-none"
          >
            <option value="ALL">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.cardinality})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Rules Table / Cards */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {filteredRules.map((rule) => {
          const isDraft = rule.status === "DRAFT";
          return (
            <div
              key={rule.id}
              className="p-5 rounded-2xl bg-surface-raised/40 border border-slate-800 hover:border-slate-700 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-white text-base">{rule.name}</span>
                  <span
                    className={`text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full ${
                      isDraft
                        ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                        : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                    }`}
                  >
                    {rule.status}
                  </span>
                  <span className="text-xs font-mono text-slate-400">v{rule.currentVersion}</span>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                  <span>Category: <strong className="text-slate-200">{rule.categoryName}</strong></span>
                  <span>•</span>
                  <span>Priority: <strong className="text-brand-400 font-mono">{rule.currentPriority || 10}</strong></span>
                  <span>•</span>
                  <span>Target Policy: <strong className="text-cyan-300">{rule.targetPolicyName || "Standard"}</strong></span>
                </div>

                {rule.description && (
                  <p className="text-xs text-slate-300 mt-1">{rule.description}</p>
                )}
              </div>

              <div className="flex items-center gap-3">
                {isDraft && (
                  <button
                    onClick={() => handlePublish(rule.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 rounded-xl transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" /> Publish
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Draft Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-surface border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white">Create New Draft Rule</h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Rule Name:</label>
                <input
                  type="text"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="e.g. California Remote Worker Policy"
                  className="w-full bg-surface-raised border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Policy Category:</label>
                <select
                  value={selectedCatId}
                  onChange={(e) => setSelectedCatId(e.target.value)}
                  className="w-full bg-surface-raised border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.cardinality})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Target Policy:</label>
                <select
                  value={selectedPolId}
                  onChange={(e) => setSelectedPolId(e.target.value)}
                  className="w-full bg-surface-raised border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                >
                  {policies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Priority:</label>
                  <input
                    type="number"
                    value={priority}
                    onChange={(e) => setPriority(Number(e.target.value))}
                    className="w-full bg-surface-raised border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500 font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Condition Field:</label>
                  <select
                    value={field}
                    onChange={(e) => setField(e.target.value)}
                    className="w-full bg-surface-raised border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="state">state</option>
                    <option value="country">country</option>
                    <option value="department">department</option>
                    <option value="employmentType">employmentType</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Equals Value:</label>
                <input
                  type="text"
                  value={fieldVal}
                  onChange={(e) => setFieldVal(e.target.value)}
                  placeholder="e.g. California"
                  className="w-full bg-surface-raised border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDraft}
                disabled={creating}
                className="px-4 py-2 text-xs font-semibold bg-brand-500 hover:bg-brand-600 text-white rounded-xl shadow-lg shadow-brand-500/20 disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create Draft"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
