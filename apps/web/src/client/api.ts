/**
 * Frontend API client communicating with backend Express endpoints.
 */

const BASE = "/api";

export async function fetchEmployees() {
  const res = await fetch(`${BASE}/employees`);
  if (!res.ok) throw new Error("Failed to fetch employees");
  return res.json();
}

export async function fetchEmployee(id: string) {
  const res = await fetch(`${BASE}/employees/${id}`);
  if (!res.ok) throw new Error("Failed to fetch employee");
  return res.json();
}

export async function createEmployee(payload: any) {
  const res = await fetch(`${BASE}/employees`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to create employee");
  }
  return res.json();
}

export async function previewOnboarding(payload: any) {
  const res = await fetch(`${BASE}/employees/preview-onboarding`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to preview onboarding policies");
  }
  return res.json();
}

export async function previewEmployeeChange(id: string, updates: any, effectiveAt?: string) {
  const res = await fetch(`${BASE}/employees/${id}/preview-change`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ updates, effectiveAt }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to preview attribute changes");
  }
  return res.json();
}

export async function updateEmployee(id: string, payload: any) {
  const res = await fetch(`${BASE}/employees/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update employee");
  }
  return res.json();
}

export async function fetchPolicies() {
  const res = await fetch(`${BASE}/policies`);
  if (!res.ok) throw new Error("Failed to fetch policies");
  return res.json();
}

export async function fetchCategories() {
  const res = await fetch(`${BASE}/policy-categories`);
  if (!res.ok) throw new Error("Failed to fetch categories");
  return res.json();
}

export async function fetchRules() {
  const res = await fetch(`${BASE}/rules`);
  if (!res.ok) throw new Error("Failed to fetch rules");
  return res.json();
}

export async function createRule(payload: any) {
  const res = await fetch(`${BASE}/rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to create rule");
  }
  return res.json();
}

export async function previewRuleImpact(payload: any) {
  const res = await fetch(`${BASE}/rules/preview-impact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to preview rule impact");
  }
  return res.json();
}

export async function previewRuleVersionImpact(ruleId: string, payload: any) {
  const res = await fetch(`${BASE}/rules/${ruleId}/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to preview rule version impact");
  }
  return res.json();
}

export async function createRuleVersion(ruleId: string, payload: any) {
  const res = await fetch(`${BASE}/rules/${ruleId}/versions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to create rule version");
  }
  return res.json();
}

export async function fetchRuleDetail(ruleId: string) {
  const res = await fetch(`${BASE}/rules/${ruleId}`);
  if (!res.ok) throw new Error("Failed to fetch rule detail");
  return res.json();
}

export async function publishRule(ruleId: string, validFrom?: string, version?: number) {
  const res = await fetch(`${BASE}/rules/${ruleId}/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ validFrom, version }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to publish rule");
  }
  return res.json();
}

export async function fetchGroups() {
  const res = await fetch(`${BASE}/groups`);
  if (!res.ok) throw new Error("Failed to fetch groups");
  return res.json();
}

export async function resolveEmployee(id: string, at?: string) {
  const query = at ? `?at=${at}` : "";
  const res = await fetch(`${BASE}/employees/${id}/resolve${query}`);
  if (!res.ok) throw new Error("Failed to resolve policies");
  return res.json();
}

export async function fetchAssignments(id: string, at?: string) {
  const query = at ? `?at=${at}` : "";
  const res = await fetch(`${BASE}/employees/${id}/assignments${query}`);
  if (!res.ok) throw new Error("Failed to fetch assignments");
  return res.json();
}

export async function fetchAssignmentHistory(id: string) {
  const res = await fetch(`${BASE}/employees/${id}/assignments/history`);
  if (!res.ok) throw new Error("Failed to fetch assignment history");
  return res.json();
}

export async function previewReconcile(id: string, at?: string) {
  const query = at ? `?at=${at}` : "";
  const res = await fetch(`${BASE}/employees/${id}/reconcile/preview${query}`);
  if (!res.ok) throw new Error("Failed to preview reconciliation");
  return res.json();
}

export async function executeReconcile(id: string, at?: string) {
  const res = await fetch(`${BASE}/employees/${id}/reconcile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ at }),
  });
  if (!res.ok) throw new Error("Failed to execute reconciliation");
  return res.json();
}

export async function reconcileCompany(companyId: string, at?: string) {
  const res = await fetch(`${BASE}/companies/${companyId}/reconcile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ at }),
  });
  if (!res.ok) throw new Error("Failed to reconcile company");
  return res.json();
}

export async function fetchTimeline(employeeId: string) {
  const res = await fetch(`${BASE}/employees/${employeeId}/timeline`);
  if (!res.ok) throw new Error("Failed to fetch timeline");
  return res.json();
}

export async function fetchWhy(employeeId: string, policyId: string, at?: string) {
  const params = new URLSearchParams({ policyId });
  if (at) params.set("at", at);
  const res = await fetch(`${BASE}/employees/${employeeId}/why?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch why explanation");
  return res.json();
}

export async function fetchAuditLogs(filters: Record<string, string> = {}) {
  const params = new URLSearchParams(filters);
  const res = await fetch(`${BASE}/audit?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch audit logs");
  return res.json();
}

export async function fetchOutboxEvents() {
  const res = await fetch(`${BASE}/outbox`);
  if (!res.ok) throw new Error("Failed to fetch outbox events");
  return res.json();
}

export async function fetchTemporalJobs() {
  const res = await fetch(`${BASE}/temporal/jobs`);
  if (!res.ok) throw new Error("Failed to fetch temporal jobs");
  return res.json();
}

export async function processOutbox() {
  const res = await fetch(`${BASE}/worker/process-outbox`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to process outbox");
  return res.json();
}

export async function processTemporal(asOfDate?: string) {
  const res = await fetch(`${BASE}/worker/process-temporal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ asOfDate }),
  });
  if (!res.ok) throw new Error("Failed to process temporal milestones");
  return res.json();
}

export async function verifyIncrementalSystem() {
  const res = await fetch(`${BASE}/system/verify-incremental`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error("Failed to run system verification");
  return res.json();
}
