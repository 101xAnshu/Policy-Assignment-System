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
  ChevronRight,
  Plus,
  Minus,
  RefreshCw,
  Check,
  X,
  HelpCircle,
  Clock,
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

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [editState, setEditState] = useState<string>("");
  const [editDept, setEditDept] = useState<string>("");
  const [editEmpType, setEditEmpType] = useState<string>("");
  const [editIsManager, setEditIsManager] = useState<boolean>(false);
  const [updating, setUpdating] = useState<boolean>(false);
  const [simDiff, setSimDiff] = useState<any | null>(null);
  const [loadingDiff, setLoadingDiff] = useState<boolean>(false);

  // Onboarding modal state
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

  useEffect(() => {
    if (!selectedEmp) return;
    fetchAssignments(selectedEmp.id, date)
      .then((res) => setAssignments(res.assignments || []))
      .catch(console.error);
    fetchTimeline(selectedEmp.id)
      .then(setTimeline)
      .catch(console.error);
  }, [selectedEmp, date]);

  // Live diff preview
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
      .then((res) => { setSimDiff(res); setLoadingDiff(false); })
      .catch(() => setLoadingDiff(false));
  }, [showEditModal, editState, editDept, editEmpType, editIsManager, date, selectedEmp]);

  // Live onboarding preview
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
      .then((res) => { setOnboardPreview(res); setLoadingOnboardPreview(false); })
      .catch(() => setLoadingOnboardPreview(false));
  }, [showOnboardModal, onboardCountry, onboardState, onboardDept, onboardEmpType, onboardIsManager, onboardHireDate, selectedEmp, employees]);

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
      console.error("Failed to update profile:", err.message);
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
    if (!onboardName || !onboardEmail || !onboardCountry || !onboardDept || !onboardHireDate) return;
    setCreatingEmp(true);
    try {
      const companyId = selectedEmp?.companyId ?? employees[0]?.companyId ?? "a0000000-0000-0000-0000-000000000001";
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
      console.error("Failed to onboard employee:", err.message);
    } finally {
      setCreatingEmp(false);
    }
  };

  const inputClass = "w-full bg-background border border-border rounded px-3 py-2 text-sm text-primary focus:outline-none focus:border-accent transition-colors";
  const labelClass = "block text-xs font-medium text-secondary mb-1.5";

  return (
    <div className="flex-1 flex overflow-hidden bg-background">
      {/* Sidebar: Employee List */}
      <div className="w-72 border-r border-border bg-surface flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-[13px] font-medium text-primary flex items-center gap-2">
            <User className="w-4 h-4 text-secondary" /> Employees
            <span className="text-secondary">({employees.length})</span>
          </h2>
          <button
            onClick={handleOpenOnboard}
            className="px-2.5 py-1 text-xs font-medium rounded bg-accent hover:bg-accent-500 text-white flex items-center gap-1 transition-colors"
          >
            <UserPlus className="w-3 h-3" /> Add
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {employees.map((emp) => {
            const isSelected = selectedEmp?.id === emp.id;
            return (
              <button
                key={emp.id}
                onClick={() => setSelectedEmp(emp)}
                className={`w-full text-left p-3 rounded transition-colors flex items-center justify-between ${
                  isSelected
                    ? "bg-surface-raised text-primary"
                    : "text-secondary hover:bg-surface-raised/50 hover:text-primary"
                }`}
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[13px] truncate">{emp.name}</span>
                    {emp.isManager && (
                      <span className="text-[10px] font-medium bg-accent/10 text-accent px-1.5 py-0.5 rounded flex-shrink-0">
                        Manager
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-tertiary">
                    <span className="flex items-center gap-1">
                      <Briefcase className="w-3 h-3" /> {emp.department}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {emp.state || emp.country}
                    </span>
                  </div>
                </div>
                <ChevronRight className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? "text-secondary" : "text-tertiary"}`} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      {selectedEmp && (
        <div className="flex-1 flex flex-col overflow-y-auto">
          {/* Header */}
          <div className="p-5 border-b border-border flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/10 text-accent flex items-center justify-center font-heading font-semibold text-lg">
                {selectedEmp.name.charAt(0)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-heading text-lg font-semibold text-primary">{selectedEmp.name}</h1>
                  <span className="text-xs font-mono text-tertiary px-1.5 py-0.5 bg-surface-raised rounded border border-border">
                    v{selectedEmp.version}
                  </span>
                  {selectedEmp.isManager && (
                    <span className="text-xs text-accent bg-accent/10 px-1.5 py-0.5 rounded">Manager</span>
                  )}
                </div>
                <p className="text-sm text-secondary flex items-center gap-2 mt-0.5">
                  <span>{selectedEmp.email}</span>
                  <span className="text-tertiary">·</span>
                  <span>{selectedEmp.department}</span>
                  <span className="text-tertiary">·</span>
                  <span>{selectedEmp.state ? `${selectedEmp.state}, ${selectedEmp.country}` : selectedEmp.country}</span>
                  <span className="text-tertiary">·</span>
                  <span>Hired {selectedEmp.hireDate}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-surface-raised px-3 py-1.5 rounded border border-border">
                <Calendar className="w-3.5 h-3.5 text-secondary" />
                <span className="text-xs text-secondary">Effective:</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="bg-transparent text-sm text-primary focus:outline-none cursor-pointer font-mono"
                />
              </div>
              <button
                onClick={handleOpenEdit}
                className="px-3 py-1.5 rounded bg-surface-raised hover:bg-surface-highlight text-primary text-[13px] font-medium flex items-center gap-1.5 border border-border transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5 text-secondary" /> Edit attributes
              </button>
            </div>
          </div>

          {/* Tab navigation */}
          <div className="px-5 border-b border-border flex items-center gap-4 text-[13px]">
            <button
              onClick={() => setActiveTab("policies")}
              className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === "policies"
                  ? "border-accent text-primary font-medium"
                  : "border-transparent text-secondary hover:text-primary"
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" /> Policies ({assignments.length})
            </button>
            <button
              onClick={() => setActiveTab("timeline")}
              className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === "timeline"
                  ? "border-accent text-primary font-medium"
                  : "border-transparent text-secondary hover:text-primary"
              }`}
            >
              <History className="w-3.5 h-3.5" /> Timeline
            </button>
          </div>

          {/* Policies tab */}
          {activeTab === "policies" && (
            <div className="p-5 space-y-4">
              <div>
                <h3 className="text-sm font-medium text-primary">Active policy assignments</h3>
                <p className="text-xs text-secondary mt-0.5">
                  Resolved at <span className="font-mono">{date}</span>
                </p>
              </div>

              {assignments.length === 0 ? (
                <div className="p-8 text-center bg-surface rounded border border-border text-secondary text-sm">
                  No active policy assignments for this date.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {assignments.map((asgn) => (
                    <div
                      key={asgn.id}
                      className="p-4 rounded bg-surface border border-border hover:border-accent/20 transition-colors flex flex-col justify-between space-y-3"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-secondary">{asgn.categoryName}</span>
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                            asgn.cardinality === "ONE"
                              ? "border-border text-secondary bg-surface-raised"
                              : "border-status-success/20 text-status-success bg-status-success/5"
                          }`}>
                            {asgn.cardinality}
                          </span>
                        </div>
                        <h4 className="text-sm font-medium text-primary">{asgn.policyName}</h4>
                        <p className="text-xs text-tertiary font-mono">
                          {asgn.effectiveFrom} – {asgn.effectiveTo || "Present"}
                        </p>
                      </div>
                      <div className="pt-2 border-t border-border/50 flex items-center justify-between">
                        <span className="text-xs text-tertiary">
                          Rule v{asgn.sourceRuleVersion}
                        </span>
                        <button
                          onClick={() => setInspectPolicy({ id: asgn.policyId, name: asgn.policyName })}
                          className="text-xs font-medium text-accent hover:text-accent-300 flex items-center gap-1 transition-colors"
                        >
                          <HelpCircle className="w-3 h-3" /> Why?
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Timeline tab */}
          {activeTab === "timeline" && timeline && (
            <div className="p-5 space-y-4 max-w-3xl">
              <h3 className="text-sm font-medium text-primary">Audit trail</h3>
              <div className="space-y-3 relative before:absolute before:inset-0 before:left-[7px] before:w-px before:bg-border">
                {timeline.entries?.map((item: any, idx: number) => (
                  <div key={idx} className="relative flex items-start gap-4 pl-6">
                    <div className="absolute left-[3px] top-2 w-2 h-2 rounded-full bg-accent" />
                    <div className="flex-1 p-3 rounded bg-surface border border-border space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-primary">{item.type}</span>
                        <span className="font-mono text-tertiary">{item.timestamp}</span>
                      </div>
                      <p className="text-xs text-secondary">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit attributes modal */}
      {showEditModal && selectedEmp && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-surface border border-border rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-accent" />
                <h3 className="font-heading text-[15px] font-semibold text-primary">Edit attributes</h3>
              </div>
              <button onClick={() => setShowEditModal(false)} className="text-secondary hover:text-primary p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>State / Region</label>
                  <input type="text" value={editState} onChange={(e) => setEditState(e.target.value)} placeholder="e.g. California" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Department</label>
                  <select value={editDept} onChange={(e) => setEditDept(e.target.value)} className={inputClass}>
                    <option value="Engineering">Engineering</option>
                    <option value="Finance">Finance</option>
                    <option value="Sales">Sales</option>
                    <option value="HR">HR</option>
                    <option value="Legal">Legal</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Employment type</label>
                  <select value={editEmpType} onChange={(e) => setEditEmpType(e.target.value)} className={inputClass}>
                    <option value="FULL_TIME">Full-time</option>
                    <option value="PART_TIME">Part-time</option>
                    <option value="CONTRACTOR">Contractor</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <input type="checkbox" id="editIsManager" checked={editIsManager} onChange={(e) => setEditIsManager(e.target.checked)} className="w-4 h-4 rounded bg-background border-border text-accent focus:ring-accent" />
                  <label htmlFor="editIsManager" className="text-sm text-primary">Manager</label>
                </div>
              </div>

              {/* Live diff preview */}
              <div className="p-4 rounded bg-background border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-medium text-primary">Reconciliation preview</h4>
                  {loadingDiff ? (
                    <span className="text-xs text-accent flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Simulating...
                    </span>
                  ) : simDiff ? (
                    <span className="text-xs text-secondary">
                      {simDiff.summary.added} added · {simDiff.summary.revoked} revoked · {simDiff.summary.unchanged} unchanged
                    </span>
                  ) : null}
                </div>

                {simDiff && (
                  <div className="space-y-1.5 pt-2 border-t border-border/50">
                    {simDiff.diff.toAdd?.map((item: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-status-success bg-status-success/5 px-3 py-1.5 rounded">
                        <Plus className="w-3 h-3" />
                        <span className="font-medium">Add:</span> Policy {item.policyId}
                      </div>
                    ))}
                    {simDiff.diff.toRevoke?.map((item: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-status-error bg-status-error/5 px-3 py-1.5 rounded">
                        <Minus className="w-3 h-3" />
                        <span className="font-medium">Revoke:</span> {item.policyName || `Policy ${item.policyId}`}
                      </div>
                    ))}
                    {simDiff.diff.toAdd?.length === 0 && simDiff.diff.toRevoke?.length === 0 && (
                      <div className="text-xs text-tertiary py-1">No policy changes for these attributes.</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-border flex items-center justify-between">
              <span className="text-xs text-tertiary">
                Changes effective on <span className="font-mono">{date}</span>
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowEditModal(false)} className="px-3 py-1.5 rounded text-[13px] font-medium text-secondary hover:text-primary">
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={updating}
                  className="px-3 py-1.5 rounded text-[13px] font-medium bg-accent hover:bg-accent-500 text-white transition-colors"
                >
                  {updating ? "Applying..." : "Apply changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding modal */}
      {showOnboardModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-surface border border-border rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-accent" />
                <div>
                  <h3 className="font-heading text-[15px] font-semibold text-primary">Onboard employee</h3>
                  <p className="text-xs text-secondary mt-0.5">Preview policy assignments before creating the record</p>
                </div>
              </div>
              <button onClick={() => setShowOnboardModal(false)} className="text-secondary hover:text-primary p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Full name</label>
                  <input type="text" value={onboardName} onChange={(e) => setOnboardName(e.target.value)} placeholder="e.g. Rachel Adams" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Email</label>
                  <input type="email" value={onboardEmail} onChange={(e) => setOnboardEmail(e.target.value)} placeholder="e.g. rachel@acme.com" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Country</label>
                  <select value={onboardCountry} onChange={(e) => setOnboardCountry(e.target.value)} className={inputClass}>
                    <option value="US">United States</option>
                    <option value="Canada">Canada</option>
                    <option value="UK">United Kingdom</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>State / Province</label>
                  <input type="text" value={onboardState} onChange={(e) => setOnboardState(e.target.value)} placeholder="e.g. California" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Department</label>
                  <select value={onboardDept} onChange={(e) => setOnboardDept(e.target.value)} className={inputClass}>
                    <option value="Engineering">Engineering</option>
                    <option value="Finance">Finance</option>
                    <option value="Sales">Sales</option>
                    <option value="HR">HR</option>
                    <option value="Legal">Legal</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Employment type</label>
                  <select value={onboardEmpType} onChange={(e) => setOnboardEmpType(e.target.value)} className={inputClass}>
                    <option value="FULL_TIME">Full-time</option>
                    <option value="PART_TIME">Part-time</option>
                    <option value="CONTRACTOR">Contractor</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Start date</label>
                  <input type="date" value={onboardHireDate} onChange={(e) => setOnboardHireDate(e.target.value)} className={`${inputClass} font-mono`} />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <input type="checkbox" id="onboardIsManager" checked={onboardIsManager} onChange={(e) => setOnboardIsManager(e.target.checked)} className="w-4 h-4 rounded bg-background border-border text-accent focus:ring-accent" />
                  <label htmlFor="onboardIsManager" className="text-sm text-primary">Manager</label>
                </div>
              </div>

              {/* Policy assignment preview */}
              <div className="p-4 rounded bg-background border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-medium text-primary">Policy assignment preview</h4>
                  {loadingOnboardPreview ? (
                    <span className="text-xs text-accent flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Evaluating...
                    </span>
                  ) : onboardPreview ? (
                    <span className="text-xs text-status-success flex items-center gap-1">
                      <Check className="w-3 h-3" /> {onboardPreview.assignments?.length} policies
                    </span>
                  ) : null}
                </div>

                {onboardPreview?.assignments && (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50">
                    {onboardPreview.assignments.map((asgn: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-2.5 rounded bg-surface border border-border text-xs">
                        <div className="space-y-0.5">
                          <span className="text-[10px] text-tertiary font-mono">{asgn.categoryId}</span>
                          <p className="text-primary">Policy {asgn.policyId}</p>
                        </div>
                        <span className="text-[10px] text-status-success font-medium bg-status-success/10 px-1.5 py-0.5 rounded">
                          Assigned
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-border flex items-center justify-between">
              <span className="text-xs text-tertiary">No changes until confirmed</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowOnboardModal(false)} className="px-3 py-1.5 rounded text-[13px] font-medium text-secondary hover:text-primary">
                  Cancel
                </button>
                <button
                  onClick={handleConfirmOnboard}
                  disabled={creatingEmp}
                  className="px-3 py-1.5 rounded text-[13px] font-medium bg-accent hover:bg-accent-500 text-white transition-colors"
                >
                  {creatingEmp ? "Creating..." : "Confirm & onboard"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Why modal */}
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
