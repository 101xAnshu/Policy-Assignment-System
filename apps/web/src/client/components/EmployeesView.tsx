import React, { useState, useEffect } from "react";
import {
  fetchEmployees,
  fetchAssignments,
  fetchTimeline,
  updateEmployee,
  processOutbox,
} from "../api";
import {
  User,
  MapPin,
  Briefcase,
  Calendar,
  ShieldCheck,
  History,
  Edit3,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowUpRight,
  ChevronRight,
  Filter,
} from "lucide-react";
import { WhyModal } from "./WhyModal";

export const EmployeesView: React.FC = () => {
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmp, setSelectedEmp] = useState<any | null>(null);
  const [date, setDate] = useState<string>("2024-08-28");
  const [assignments, setAssignments] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<"policies" | "timeline">("policies");
  const [inspectPolicy, setInspectPolicy] = useState<{ id: string; name: string } | null>(null);

  // Edit Profile Modal state
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [editState, setEditState] = useState<string>("");
  const [editDept, setEditDept] = useState<string>("");
  const [editEmpType, setEditEmpType] = useState<string>("");
  const [editIsManager, setEditIsManager] = useState<boolean>(false);
  const [updating, setUpdating] = useState<boolean>(false);

  const loadEmployees = async () => {
    const data = await fetchEmployees();
    setEmployees(data);
    if (data.length > 0 && !selectedEmp) {
      setSelectedEmp(data[0]);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  // Load assignments & timeline when selected employee or date changes
  useEffect(() => {
    if (!selectedEmp) return;

    fetchAssignments(selectedEmp.id, date)
      .then((res) => setAssignments(res.assignments || []))
      .catch(console.error);

    fetchTimeline(selectedEmp.id)
      .then(setTimeline)
      .catch(console.error);
  }, [selectedEmp, date]);

  const handleOpenEdit = () => {
    if (!selectedEmp) return;
    setEditState(selectedEmp.state || "");
    setEditDept(selectedEmp.department);
    setEditEmpType(selectedEmp.employmentType);
    setEditIsManager(selectedEmp.isManager);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedEmp) return;
    setUpdating(true);
    try {
      await updateEmployee(selectedEmp.id, {
        state: editState || undefined,
        department: editDept,
        employmentType: editEmpType,
        isManager: editIsManager,
      });

      // Automatically run outbox background processor
      await processOutbox();

      await loadEmployees();
      const updated = await fetchEmployees();
      const current = updated.find((e: any) => e.id === selectedEmp.id);
      if (current) setSelectedEmp(current);

      setShowEditModal(false);
    } catch (err: any) {
      alert("Failed to update profile: " + err.message);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-background">
      {/* Left Sidebar: Employee List */}
      <div className="w-80 border-r border-slate-800 bg-surface/40 flex flex-col">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <User className="w-4 h-4 text-brand-400" /> Employees ({employees.length})
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 p-2 space-y-1">
          {employees.map((emp) => {
            const isSelected = selectedEmp?.id === emp.id;
            return (
              <button
                key={emp.id}
                onClick={() => setSelectedEmp(emp)}
                className={`w-full text-left p-3.5 rounded-xl transition-all flex items-center justify-between ${
                  isSelected
                    ? "bg-brand-500/15 border border-brand-500/30 text-white shadow-lg shadow-brand-500/5"
                    : "text-slate-300 hover:bg-surface-raised hover:text-white border border-transparent"
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{emp.name}</span>
                    {emp.isManager && (
                      <span className="text-[10px] uppercase font-bold bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded">
                        Lead
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Briefcase className="w-3 h-3" /> {emp.department}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {emp.state || emp.country}
                    </span>
                  </div>
                </div>
                <ChevronRight
                  className={`w-4 h-4 transition-transform ${
                    isSelected ? "text-brand-400 translate-x-1" : "text-slate-600"
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      {selectedEmp && (
        <div className="flex-1 flex flex-col overflow-y-auto">
          {/* Header Banner */}
          <div className="p-6 border-b border-slate-800 bg-surface-raised/20 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-black text-white">{selectedEmp.name}</h1>
                <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                  v{selectedEmp.currentVersion || 1}
                </span>
                <span className="text-xs px-2.5 py-1 rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/20 font-medium">
                  {selectedEmp.employmentType}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-400 mt-2">
                <span>Hire Date: <strong className="text-slate-200 font-mono">{selectedEmp.hireDate}</strong></span>
                <span>•</span>
                <span>Department: <strong className="text-slate-200">{selectedEmp.department}</strong></span>
                <span>•</span>
                <span>Location: <strong className="text-slate-200">{selectedEmp.state ? `${selectedEmp.state}, ` : ""}{selectedEmp.country}</strong></span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleOpenEdit}
                className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-surface-raised border border-slate-700 text-slate-200 hover:text-white hover:border-brand-500 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5 text-brand-400" /> Relocate / Edit Attributes
              </button>

              {/* Point in Time Picker */}
              <div className="flex items-center gap-2 bg-surface-raised border border-slate-700 rounded-xl px-3 py-1.5">
                <Calendar className="w-4 h-4 text-cyan-400" />
                <span className="text-xs text-slate-400">At Date:</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="bg-transparent text-xs text-white font-mono focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Sub-nav Tabs */}
          <div className="px-6 border-b border-slate-800 bg-surface/40 flex gap-6">
            <button
              onClick={() => setActiveTab("policies")}
              className={`py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === "policies"
                  ? "border-brand-500 text-brand-400"
                  : "border-transparent text-slate-400 hover:text-white"
              }`}
            >
              <ShieldCheck className="w-4 h-4" /> Active Policy Assignments ({assignments.length})
            </button>
            <button
              onClick={() => setActiveTab("timeline")}
              className={`py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === "timeline"
                  ? "border-cyan-500 text-cyan-400"
                  : "border-transparent text-slate-400 hover:text-white"
              }`}
            >
              <History className="w-4 h-4" /> Chronological Timeline & Audits ({timeline?.totalEvents || 0})
            </button>
          </div>

          {/* Tab 1: Policies Matrix */}
          {activeTab === "policies" && (
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {assignments.map((asgn) => (
                  <div
                    key={asgn.id}
                    className="p-5 rounded-2xl bg-surface-raised/40 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          {asgn.categoryName}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-brand-400 border border-brand-500/20">
                          {asgn.cardinality}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-white mb-2">{asgn.policyName}</h3>
                      <div className="text-xs text-slate-400 space-y-1 font-mono">
                        <div>Effective: <span className="text-emerald-400">{asgn.effectiveFrom}</span></div>
                        {asgn.effectiveTo && <div>Until: <span className="text-rose-400">{asgn.effectiveTo}</span></div>}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                      <span className="text-xs text-slate-500 font-mono">Rule v{asgn.sourceRuleVersion}</span>
                      <button
                        onClick={() =>
                          setInspectPolicy({ id: asgn.policyId, name: asgn.policyName })
                        }
                        className="flex items-center gap-1.5 text-xs font-semibold text-brand-400 hover:text-brand-300 bg-brand-500/10 hover:bg-brand-500/20 px-2.5 py-1 rounded-lg transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5" /> Explain Why
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {assignments.length === 0 && (
                <div className="py-16 text-center text-slate-500 text-sm">
                  No active policy assignments found for this employee at {date}. Run reconciliation to converge policies.
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Chronological Timeline */}
          {activeTab === "timeline" && timeline && (
            <div className="p-6 space-y-6">
              <div className="relative pl-6 border-l-2 border-slate-800 space-y-6">
                {timeline.timeline.map((event: any) => (
                  <div key={event.id} className="relative group">
                    {/* Circle Indicator */}
                    <div
                      className={`absolute -left-[31px] top-1 w-4 h-4 rounded-full border-2 bg-background transition-colors ${
                        event.type === "EMPLOYEE_VERSION"
                          ? "border-brand-500 group-hover:bg-brand-500"
                          : event.type === "POLICY_ASSIGNMENT"
                          ? "border-emerald-500 group-hover:bg-emerald-500"
                          : "border-cyan-500 group-hover:bg-cyan-500"
                      }`}
                    />

                    <div className="p-4 rounded-xl bg-surface-raised/40 border border-slate-800 group-hover:border-slate-700 transition-all">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-white text-sm">{event.title}</span>
                        <span className="text-xs font-mono text-slate-400">{event.effectiveAt}</span>
                      </div>
                      <p className="text-xs text-slate-300">{event.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Profile Modal */}
      {showEditModal && selectedEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-surface border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5">
            <h3 className="text-lg font-bold text-white">Relocate / Update {selectedEmp.name}</h3>
            <p className="text-xs text-slate-400">
              Modifying profile attributes will atomically insert a new version into the temporal store and trigger incremental scoped reconciliation.
            </p>

            <div className="space-y-4 text-xs">
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">State / Region:</label>
                <input
                  type="text"
                  value={editState}
                  onChange={(e) => setEditState(e.target.value)}
                  placeholder="e.g. California, New York, Ontario"
                  className="w-full bg-surface-raised border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Department:</label>
                <input
                  type="text"
                  value={editDept}
                  onChange={(e) => setEditDept(e.target.value)}
                  className="w-full bg-surface-raised border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Employment Type:</label>
                <select
                  value={editEmpType}
                  onChange={(e) => setEditEmpType(e.target.value)}
                  className="w-full bg-surface-raised border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                >
                  <option value="FULL_TIME">FULL_TIME</option>
                  <option value="PART_TIME">PART_TIME</option>
                  <option value="CONTRACTOR">CONTRACTOR</option>
                  <option value="INTERN">INTERN</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isManagerCheckbox"
                  checked={editIsManager}
                  onChange={(e) => setEditIsManager(e.target.checked)}
                  className="rounded border-slate-700 text-brand-500 focus:ring-0"
                />
                <label htmlFor="isManagerCheckbox" className="text-slate-300 font-semibold cursor-pointer">
                  Is Manager / Lead
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={updating}
                className="px-4 py-2 text-xs font-semibold bg-brand-500 hover:bg-brand-600 text-white rounded-xl shadow-lg shadow-brand-500/20 disabled:opacity-50"
              >
                {updating ? "Updating..." : "Save & Reconcile"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* "Why?" Modal */}
      {inspectPolicy && selectedEmp && (
        <WhyModal
          employeeId={selectedEmp.id}
          employeeName={selectedEmp.name}
          policyId={inspectPolicy.id}
          policyName={inspectPolicy.name}
          date={date}
          onClose={() => setInspectPolicy(null)}
        />
      )}
    </div>
  );
};
