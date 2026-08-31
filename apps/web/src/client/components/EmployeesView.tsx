import React, { useState, useEffect } from "react";
import {
  fetchEmployees,
  fetchAssignments,
  fetchTimeline,
  updateEmployee,
  createEmployee,
  previewOnboarding,
  previewEmployeeChange,
  processOutbox,
} from "../api";
import {
  User,
  UserPlus,
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
  PlusCircle,
  MinusCircle,
  RefreshCw,
  AlertTriangle,
  Info,
  Check,
  X,
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

  // Edit Profile / Simulation Modal state
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [editState, setEditState] = useState<string>("");
  const [editDept, setEditDept] = useState<string>("");
  const [editEmpType, setEditEmpType] = useState<string>("");
  const [editIsManager, setEditIsManager] = useState<boolean>(false);
  const [updating, setUpdating] = useState<boolean>(false);
  const [simDiff, setSimDiff] = useState<any | null>(null);
  const [loadingDiff, setLoadingDiff] = useState<boolean>(false);

  // Onboarding Modal state
  const [showOnboardModal, setShowOnboardModal] = useState<boolean>(false);
  const [onboardName, setOnboardName] = useState<string>("");
  const [onboardEmail, setOnboardEmail] = useState<string>("");
  const [onboardCountry, setOnboardCountry] = useState<string>("US");
  const [onboardState, setOnboardState] = useState<string>("California");
  const [onboardDept, setOnboardDept] = useState<string>("Engineering");
  const [onboardEmpType, setOnboardEmpType] = useState<string>("FULL_TIME");
  const [onboardIsManager, setOnboardIsManager] = useState<boolean>(false);
  const [onboardHireDate, setOnboardHireDate] = useState<string>("2024-08-28");
  const [onboardPreview, setOnboardPreview] = useState<any | null>(null);
  const [loadingOnboardPreview, setLoadingOnboardPreview] = useState<boolean>(false);
  const [creatingEmp, setCreatingEmp] = useState<boolean>(false);

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

  // Compute live diff preview when edit fields change
  useEffect(() => {
    if (!showEditModal || !selectedEmp) return;

    setLoadingDiff(true);
    const updates = {
      state: editState || null,
      department: editDept,
      employmentType: editEmpType,
      isManager: editIsManager,
    };

    previewEmployeeChange(selectedEmp.id, updates, date)
      .then((res) => {
        setSimDiff(res);
        setLoadingDiff(false);
      })
      .catch((err) => {
        console.error("Preview change error:", err);
        setLoadingDiff(false);
      });
  }, [showEditModal, editState, editDept, editEmpType, editIsManager, date, selectedEmp]);

  // Compute live onboarding preview when onboarding fields change
  useEffect(() => {
    if (!showOnboardModal) return;

    setLoadingOnboardPreview(true);
    const payload = {
      companyId: selectedEmp?.companyId ?? employees[0]?.companyId ?? "a0000000-0000-0000-0000-000000000001",
      country: onboardCountry,
      state: onboardState || null,
      department: onboardDept,
      employmentType: onboardEmpType,
      isManager: onboardIsManager,
      hireDate: onboardHireDate,
    };

    previewOnboarding(payload)
      .then((res) => {
        setOnboardPreview(res);
        setLoadingOnboardPreview(false);
      })
      .catch((err) => {
        console.error("Preview onboarding error:", err);
        setLoadingOnboardPreview(false);
      });
  }, [
    showOnboardModal,
    onboardCountry,
    onboardState,
    onboardDept,
    onboardEmpType,
    onboardIsManager,
    onboardHireDate,
    selectedEmp,
    employees,
  ]);

  const handleOpenEdit = () => {
    if (!selectedEmp) return;
    setEditState(selectedEmp.state || "");
    setEditDept(selectedEmp.department);
    setEditEmpType(selectedEmp.employmentType);
    setEditIsManager(selectedEmp.isManager);
    setSimDiff(null);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedEmp) return;
    setUpdating(true);
    try {
      await updateEmployee(selectedEmp.id, {
        state: editState || null,
        department: editDept,
        employmentType: editEmpType,
        isManager: editIsManager,
        effectiveAt: date,
      });

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

  const handleOpenOnboard = () => {
    setOnboardName("");
    setOnboardEmail("");
    setOnboardCountry("US");
    setOnboardState("California");
    setOnboardDept("Engineering");
    setOnboardEmpType("FULL_TIME");
    setOnboardIsManager(false);
    setOnboardHireDate("2024-08-28");
    setOnboardPreview(null);
    setShowOnboardModal(true);
  };

  const handleConfirmOnboard = async () => {
    if (!onboardName || !onboardEmail || !onboardCountry || !onboardDept || !onboardHireDate) {
      alert("Please fill in all required fields.");
      return;
    }

    setCreatingEmp(true);
    try {
      const companyId =
        selectedEmp?.companyId ?? employees[0]?.companyId ?? "a0000000-0000-0000-0000-000000000001";

      const newEmp = await createEmployee({
        companyId,
        name: onboardName,
        email: onboardEmail,
        country: onboardCountry,
        state: onboardState || null,
        department: onboardDept,
        employmentType: onboardEmpType,
        isManager: onboardIsManager,
        hireDate: onboardHireDate,
      });

      await processOutbox();
      await loadEmployees();
      setSelectedEmp(newEmp);
      setShowOnboardModal(false);
    } catch (err: any) {
      alert("Failed to onboard employee: " + err.message);
    } finally {
      setCreatingEmp(false);
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
          <button
            onClick={handleOpenOnboard}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-brand-500 hover:bg-brand-400 text-white flex items-center gap-1.5 transition-all shadow-md shadow-brand-500/20"
          >
            <UserPlus className="w-3.5 h-3.5" /> Onboard
          </button>
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
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center font-bold text-xl text-white shadow-lg shadow-brand-500/20">
                {selectedEmp.name.charAt(0)}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-bold text-white tracking-tight">{selectedEmp.name}</h1>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    v{selectedEmp.version}
                  </span>
                  {selectedEmp.isManager && (
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30">
                      Manager
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-400 flex items-center gap-4 mt-1">
                  <span>{selectedEmp.email}</span>
                  <span>•</span>
                  <span>{selectedEmp.department}</span>
                  <span>•</span>
                  <span>{selectedEmp.state ? `${selectedEmp.state}, ${selectedEmp.country}` : selectedEmp.country}</span>
                  <span>•</span>
                  <span>Hired {selectedEmp.hireDate}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Date Selector */}
              <div className="flex items-center gap-2 bg-surface px-3 py-1.5 rounded-xl border border-slate-800">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-400">Effective:</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="bg-transparent text-sm text-white focus:outline-none cursor-pointer font-mono"
                />
              </div>

              {/* Edit Profile Button with Preview */}
              <button
                onClick={handleOpenEdit}
                className="px-3.5 py-2 rounded-xl bg-surface-raised hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-2 border border-slate-700 transition-all shadow-sm"
              >
                <Edit3 className="w-3.5 h-3.5 text-brand-400" /> Edit & Simulate Diff
              </button>
            </div>
          </div>

          {/* Subheader Navigation Tabs */}
          <div className="px-6 border-b border-slate-800 flex items-center gap-6 text-sm font-medium">
            <button
              onClick={() => setActiveTab("policies")}
              className={`py-3.5 border-b-2 transition-all flex items-center gap-2 ${
                activeTab === "policies"
                  ? "border-brand-500 text-white font-semibold"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <ShieldCheck className="w-4 h-4" /> Active Policies ({assignments.length})
            </button>
            <button
              onClick={() => setActiveTab("timeline")}
              className={`py-3.5 border-b-2 transition-all flex items-center gap-2 ${
                activeTab === "timeline"
                  ? "border-brand-500 text-white font-semibold"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <History className="w-4 h-4" /> Chronological Timeline
            </button>
          </div>

          {/* Tab Content: Policies */}
          {activeTab === "policies" && (
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white">Resolved Policy Assignments</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Valid-time policies active on <span className="font-mono text-slate-200">{date}</span>
                  </p>
                </div>
              </div>

              {assignments.length === 0 ? (
                <div className="p-8 text-center bg-surface/30 rounded-2xl border border-slate-800 text-slate-400">
                  No active policy assignments found for this date.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {assignments.map((asgn) => (
                    <div
                      key={asgn.id}
                      className="p-4 rounded-2xl bg-surface/60 border border-slate-800/80 hover:border-slate-700 transition-all flex flex-col justify-between space-y-4"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                            {asgn.categoryName}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                              asgn.cardinality === "ONE"
                                ? "bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
                                : "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                            }`}
                          >
                            {asgn.cardinality}
                          </span>
                        </div>
                        <h4 className="text-base font-bold text-white">{asgn.policyName}</h4>
                        <p className="text-xs text-slate-400 font-mono">
                          Effective: {asgn.effectiveFrom} → {asgn.effectiveTo || "Present"}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between">
                        <span className="text-xs text-slate-400 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-brand-400" />
                          Rule v{asgn.sourceRuleVersion}
                        </span>
                        <button
                          onClick={() => setInspectPolicy({ id: asgn.policyId, name: asgn.policyName })}
                          className="text-xs font-semibold text-brand-400 hover:text-brand-300 flex items-center gap-1 transition-colors"
                        >
                          Why? <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab Content: Timeline */}
          {activeTab === "timeline" && timeline && (
            <div className="p-6 space-y-6 max-w-4xl">
              <h3 className="text-base font-bold text-white">Unified Chronological Audit Trail</h3>
              <div className="space-y-4 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-slate-800">
                {timeline.entries?.map((item: any, idx: number) => (
                  <div key={idx} className="relative flex items-start gap-4 pl-8">
                    <div className="absolute left-2 top-1.5 w-3.5 h-3.5 rounded-full bg-brand-500 border-2 border-background" />
                    <div className="flex-1 p-4 rounded-xl bg-surface/60 border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-white">{item.type}</span>
                        <span className="font-mono text-slate-400">{item.timestamp}</span>
                      </div>
                      <p className="text-xs text-slate-300">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Profile & Simulation Diff Modal (§32) */}
      {showEditModal && selectedEmp && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-surface border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Edit3 className="w-5 h-5 text-brand-400" />
                <h3 className="text-base font-bold text-white">Edit Attributes & Preview Diff</h3>
              </div>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {/* Attribute Inputs */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    State / Region
                  </label>
                  <input
                    type="text"
                    value={editState}
                    onChange={(e) => setEditState(e.target.value)}
                    placeholder="e.g. California or New York"
                    className="w-full bg-background border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Department
                  </label>
                  <select
                    value={editDept}
                    onChange={(e) => setEditDept(e.target.value)}
                    className="w-full bg-background border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="Engineering">Engineering</option>
                    <option value="Finance">Finance</option>
                    <option value="Sales">Sales</option>
                    <option value="HR">HR</option>
                    <option value="Legal">Legal</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Employment Type
                  </label>
                  <select
                    value={editEmpType}
                    onChange={(e) => setEditEmpType(e.target.value)}
                    className="w-full bg-background border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="FULL_TIME">Full-time</option>
                    <option value="PART_TIME">Part-time</option>
                    <option value="CONTRACTOR">Contractor</option>
                  </select>
                </div>

                <div className="flex items-center gap-3 pt-6">
                  <input
                    type="checkbox"
                    id="editIsManager"
                    checked={editIsManager}
                    onChange={(e) => setEditIsManager(e.target.checked)}
                    className="w-4 h-4 rounded text-brand-500 focus:ring-brand-500 bg-background border-slate-700"
                  />
                  <label htmlFor="editIsManager" className="text-sm font-semibold text-white">
                    People Manager Status
                  </label>
                </div>
              </div>

              {/* Live Simulation Diff Box (§32) */}
              <div className="p-4 rounded-xl bg-background border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-brand-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                      Live Reconciliation Preview
                    </h4>
                  </div>
                  {loadingDiff ? (
                    <span className="text-xs text-brand-400 flex items-center gap-1 font-mono animate-pulse">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Simulating...
                    </span>
                  ) : simDiff ? (
                    <span className="text-xs text-slate-400 font-mono">
                      {simDiff.summary.added} added • {simDiff.summary.revoked} revoked • {simDiff.summary.unchanged} unchanged
                    </span>
                  ) : null}
                </div>

                {simDiff && (
                  <div className="space-y-2 pt-2 border-t border-slate-800/80">
                    {simDiff.diff.toAdd?.map((item: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
                        <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="font-semibold">Add:</span> Policy {item.policyId}
                      </div>
                    ))}

                    {simDiff.diff.toRevoke?.map((item: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-rose-300 bg-rose-500/10 px-3 py-1.5 rounded-lg border border-rose-500/20">
                        <MinusCircle className="w-3.5 h-3.5 text-rose-400" />
                        <span className="font-semibold">Revoke:</span> {item.policyName || `Policy ${item.policyId}`}
                      </div>
                    ))}

                    {simDiff.diff.toAdd?.length === 0 && simDiff.diff.toRevoke?.length === 0 && (
                      <div className="text-xs text-slate-400 py-1">
                        No policy changes detected for these attributes.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-surface-raised/40 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Changes will take effect on <span className="font-mono text-slate-200">{date}</span>.
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={updating}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-brand-500 hover:bg-brand-400 text-white transition-all shadow-md shadow-brand-500/20 flex items-center gap-1.5"
                >
                  {updating ? "Applying..." : "Apply Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Employee Onboarding Flow Modal (§31) */}
      {showOnboardModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-surface border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <UserPlus className="w-5 h-5 text-brand-400" />
                <div>
                  <h3 className="text-base font-bold text-white">Onboard New Employee</h3>
                  <p className="text-xs text-slate-400">
                    Preview resulting policy assignments before confirming creation (§31)
                  </p>
                </div>
              </div>
              <button onClick={() => setShowOnboardModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {/* Form Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={onboardName}
                    onChange={(e) => setOnboardName(e.target.value)}
                    placeholder="e.g. Rachel Adams"
                    className="w-full bg-background border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    value={onboardEmail}
                    onChange={(e) => setOnboardEmail(e.target.value)}
                    placeholder="e.g. rachel.adams@acme.com"
                    className="w-full bg-background border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Country
                  </label>
                  <select
                    value={onboardCountry}
                    onChange={(e) => setOnboardCountry(e.target.value)}
                    className="w-full bg-background border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="US">United States (US)</option>
                    <option value="Canada">Canada</option>
                    <option value="UK">United Kingdom</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    State / Province
                  </label>
                  <input
                    type="text"
                    value={onboardState}
                    onChange={(e) => setOnboardState(e.target.value)}
                    placeholder="e.g. California or New York"
                    className="w-full bg-background border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Department
                  </label>
                  <select
                    value={onboardDept}
                    onChange={(e) => setOnboardDept(e.target.value)}
                    className="w-full bg-background border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="Engineering">Engineering</option>
                    <option value="Finance">Finance</option>
                    <option value="Sales">Sales</option>
                    <option value="HR">HR</option>
                    <option value="Legal">Legal</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Employment Type
                  </label>
                  <select
                    value={onboardEmpType}
                    onChange={(e) => setOnboardEmpType(e.target.value)}
                    className="w-full bg-background border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="FULL_TIME">Full-time</option>
                    <option value="PART_TIME">Part-time</option>
                    <option value="CONTRACTOR">Contractor</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Start / Hire Date
                  </label>
                  <input
                    type="date"
                    value={onboardHireDate}
                    onChange={(e) => setOnboardHireDate(e.target.value)}
                    className="w-full bg-background border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500 font-mono"
                  />
                </div>

                <div className="flex items-center gap-3 pt-6">
                  <input
                    type="checkbox"
                    id="onboardIsManager"
                    checked={onboardIsManager}
                    onChange={(e) => setOnboardIsManager(e.target.checked)}
                    className="w-4 h-4 rounded text-brand-500 focus:ring-brand-500 bg-background border-slate-700"
                  />
                  <label htmlFor="onboardIsManager" className="text-sm font-semibold text-white">
                    People Manager Status
                  </label>
                </div>
              </div>

              {/* Dynamic Policy Assignment Preview (§31) */}
              <div className="p-4 rounded-xl bg-background border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-brand-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                      Computed Policy Assignments Preview
                    </h4>
                  </div>
                  {loadingOnboardPreview ? (
                    <span className="text-xs text-brand-400 flex items-center gap-1 font-mono animate-pulse">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Evaluating rules...
                    </span>
                  ) : onboardPreview ? (
                    <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> {onboardPreview.assignments?.length} policies will be assigned
                    </span>
                  ) : null}
                </div>

                {onboardPreview?.assignments && (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
                    {onboardPreview.assignments.map((asgn: any, i: number) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-surface/50 border border-slate-800 text-xs"
                      >
                        <div className="space-y-0.5">
                          <span className="text-[10px] text-slate-400 font-mono uppercase font-bold">
                            {asgn.categoryId}
                          </span>
                          <p className="font-semibold text-slate-200">Policy {asgn.policyId}</p>
                        </div>
                        <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          ✓ Assigned
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-surface-raised/40 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                No database changes occur until you confirm.
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowOnboardModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmOnboard}
                  disabled={creatingEmp}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-brand-500 hover:bg-brand-400 text-white transition-all shadow-md shadow-brand-500/20 flex items-center gap-1.5"
                >
                  {creatingEmp ? "Creating..." : "Confirm & Onboard"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Why Explanation Modal */}
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
