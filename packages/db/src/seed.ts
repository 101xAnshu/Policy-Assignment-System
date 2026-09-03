/**
 * Seed data for the Acme demo tenant.
 *
 * This seed creates one coherent demo environment for Sarah Chen's journey.
 *
 * Deliberate design in the seed data:
 * - Priority conflict: CA Vacation (priority 50) vs Standard Vacation (priority 10) — tests conflict resolution
 * - MANY category: Compliance training, App access — tests multi-assignment
 * - Group dependency: Manager Training requires "managers" group membership
 * - Tenure dependency: Extended Vacation requires 24 months tenure
 * - Location-based rules: CA-specific policies that change when employee moves
 *
 * All IDs are deterministic UUIDs for reproducibility and test stability.
 */

import { db, sql } from "./connection";
import {
  companies,
  employees,
  employeeVersions,
  policyCategories,
  policies,
  groups,
  groupMemberships,
  assignmentRules,
  assignmentRuleVersions,
} from "./schema/index";
import { extractDependencies } from "@warp/domain";
import type { Predicate } from "@warp/domain";

// ─── Deterministic IDs ───────────────────────────────────────────────────────
// Using UUID v4 format but hardcoded for test stability and cross-reference.

const IDS = {
  // Company
  acme: "a0000000-0000-0000-0000-000000000001",

  // Employees
  sarah: "e0000000-0000-0000-0000-000000000001",
  alex: "e0000000-0000-0000-0000-000000000002",
  maya: "e0000000-0000-0000-0000-000000000003",
  daniel: "e0000000-0000-0000-0000-000000000004",

  // Policy Categories
  catVacation: "c0000000-0000-0000-0000-000000000001",
  catSickLeave: "c0000000-0000-0000-0000-000000000002",
  catPaySchedule: "c0000000-0000-0000-0000-000000000003",
  catHealthcare: "c0000000-0000-0000-0000-000000000004",
  catCompliance: "c0000000-0000-0000-0000-000000000005",
  catStipend: "c0000000-0000-0000-0000-000000000006",
  catAppAccess: "c0000000-0000-0000-0000-000000000007",

  // Policies (prefix b)
  standardVacation: "b0000000-0000-0000-0000-000000000001",
  caVacation: "b0000000-0000-0000-0000-000000000002",
  extendedVacation: "b0000000-0000-0000-0000-000000000003",
  standardSick: "b0000000-0000-0000-0000-000000000004",
  usBiweekly: "b0000000-0000-0000-0000-000000000005",
  standardHealthcare: "b0000000-0000-0000-0000-000000000006",
  caWorkplaceTraining: "b0000000-0000-0000-0000-000000000007",
  managerTraining: "b0000000-0000-0000-0000-000000000008",
  engineeringStipend: "b0000000-0000-0000-0000-000000000009",
  github: "b0000000-0000-0000-0000-000000000010",
  slack: "b0000000-0000-0000-0000-000000000011",
  notion: "b0000000-0000-0000-0000-000000000012",

  // Groups (prefix d)
  managers: "d0000000-0000-0000-0000-000000000001",

  // Assignment Rules (prefix f0)
  ruleStandardVacation: "f0000000-0000-0000-0000-000000000001",
  ruleCaVacation: "f0000000-0000-0000-0000-000000000002",
  ruleExtendedVacation: "f0000000-0000-0000-0000-000000000003",
  ruleStandardSick: "f0000000-0000-0000-0000-000000000004",
  ruleUsBiweekly: "f0000000-0000-0000-0000-000000000005",
  ruleStandardHealthcare: "f0000000-0000-0000-0000-000000000006",
  ruleCaWorkplaceTraining: "f0000000-0000-0000-0000-000000000007",
  ruleManagerTraining: "f0000000-0000-0000-0000-000000000008",
  ruleEngineeringStipend: "f0000000-0000-0000-0000-000000000009",
  ruleGithub: "f0000000-0000-0000-0000-000000000010",
  ruleSlack: "f0000000-0000-0000-0000-000000000011",
  ruleNotion: "f0000000-0000-0000-0000-000000000012",

  // Rule Versions (prefix f1)
  rvStandardVacation: "f1000000-0000-0000-0000-000000000001",
  rvCaVacation: "f1000000-0000-0000-0000-000000000002",
  rvExtendedVacation: "f1000000-0000-0000-0000-000000000003",
  rvStandardSick: "f1000000-0000-0000-0000-000000000004",
  rvUsBiweekly: "f1000000-0000-0000-0000-000000000005",
  rvStandardHealthcare: "f1000000-0000-0000-0000-000000000006",
  rvCaWorkplaceTraining: "f1000000-0000-0000-0000-000000000007",
  rvManagerTraining: "f1000000-0000-0000-0000-000000000008",
  rvEngineeringStipend: "f1000000-0000-0000-0000-000000000009",
  rvGithub: "f1000000-0000-0000-0000-000000000010",
  rvSlack: "f1000000-0000-0000-0000-000000000011",
  rvNotion: "f1000000-0000-0000-0000-000000000012",

  // Employee Versions (prefix e1)
  evSarah: "e1000000-0000-0000-0000-000000000001",
  evAlex: "e1000000-0000-0000-0000-000000000002",
  evMaya: "e1000000-0000-0000-0000-000000000003",
  evDaniel: "e1000000-0000-0000-0000-000000000004",
} as const;

// ─── Predicate definitions ───────────────────────────────────────────────────

const PREDICATES = {
  /** Matches all full-time employees (fallback vacation) */
  fullTime: {
    type: "EQUALS",
    field: "employmentType",
    value: "FULL_TIME",
  } as Predicate,

  /** Matches California full-time employees (CA-specific vacation) */
  caFullTime: {
    type: "ALL",
    children: [
      { type: "EQUALS", field: "state", value: "California" },
      { type: "EQUALS", field: "employmentType", value: "FULL_TIME" },
    ],
  } as Predicate,

  /** Matches employees with 24+ months tenure AND full-time (Extended Vacation) */
  tenuredFullTime: {
    type: "ALL",
    children: [
      { type: "TENURE_AT_LEAST", durationMonths: 24 },
      { type: "EQUALS", field: "employmentType", value: "FULL_TIME" },
    ],
  } as Predicate,

  /** Matches all employees (everyone gets sick leave, slack, notion) */
  allEmployees: {
    type: "ALL",
    children: [],
  } as Predicate,

  /** Matches US employees */
  usEmployees: {
    type: "EQUALS",
    field: "country",
    value: "US",
  } as Predicate,

  /** Matches California employees */
  caEmployees: {
    type: "EQUALS",
    field: "state",
    value: "California",
  } as Predicate,

  /** Matches members of the managers group */
  managersGroup: {
    type: "GROUP_MEMBER",
    groupId: IDS.managers,
  } as Predicate,

  /** Matches Engineering department */
  engineering: {
    type: "EQUALS",
    field: "department",
    value: "Engineering",
  } as Predicate,
} as const;

// ─── Seed function ───────────────────────────────────────────────────────────

async function seed(closeConnection = true) {
  console.log("🌱 Seeding Acme demo data...\n");

  // ── Company ──
  console.log("  Creating company: Acme");
  await db.insert(companies).values({
    id: IDS.acme,
    name: "Acme Corporation",
  });

  // ── Employees ──
  console.log("  Creating employees...");
  const employeeData = [
    {
      id: IDS.sarah,
      companyId: IDS.acme,
      name: "Sarah Chen",
      email: "sarah.chen@acme.com",
      country: "US",
      state: "California",
      department: "Engineering",
      employmentType: "FULL_TIME",
      isManager: true,
      hireDate: "2024-08-28",
      version: 1,
    },
    {
      id: IDS.alex,
      companyId: IDS.acme,
      name: "Alex Morgan",
      email: "alex.morgan@acme.com",
      country: "US",
      state: "New York",
      department: "Engineering",
      employmentType: "FULL_TIME",
      isManager: false,
      hireDate: "2023-06-15",
      version: 1,
    },
    {
      id: IDS.maya,
      companyId: IDS.acme,
      name: "Maya Patel",
      email: "maya.patel@acme.com",
      country: "US",
      state: "California",
      department: "Finance",
      employmentType: "CONTRACTOR",
      isManager: false,
      hireDate: "2025-01-10",
      version: 1,
    },
    {
      id: IDS.daniel,
      companyId: IDS.acme,
      name: "Daniel Lee",
      email: "daniel.lee@acme.com",
      country: "US",
      state: "Oregon",
      department: "Engineering",
      employmentType: "FULL_TIME",
      isManager: true,
      hireDate: "2022-03-01",
      version: 1,
    },
  ];

  await db.insert(employees).values(employeeData);

  // ── Employee Versions (initial state) ──
  console.log("  Creating employee version history...");
  await db.insert(employeeVersions).values(
    employeeData.map((emp, i) => ({
      id: [IDS.evSarah, IDS.evAlex, IDS.evMaya, IDS.evDaniel][i],
      employeeId: emp.id,
      version: 1,
      validFrom: emp.hireDate,
      validTo: null,
      country: emp.country,
      state: emp.state,
      department: emp.department,
      employmentType: emp.employmentType,
      isManager: emp.isManager,
      hireDate: emp.hireDate,
    })),
  );

  // ── Policy Categories ──
  console.log("  Creating policy categories...");
  await db.insert(policyCategories).values([
    { id: IDS.catVacation, companyId: IDS.acme, key: "vacation", name: "Vacation", cardinality: "ONE" },
    { id: IDS.catSickLeave, companyId: IDS.acme, key: "sick_leave", name: "Sick Leave", cardinality: "ONE" },
    { id: IDS.catPaySchedule, companyId: IDS.acme, key: "pay_schedule", name: "Pay Schedule", cardinality: "ONE" },
    { id: IDS.catHealthcare, companyId: IDS.acme, key: "healthcare", name: "Healthcare", cardinality: "ONE" },
    { id: IDS.catCompliance, companyId: IDS.acme, key: "compliance", name: "Compliance Training", cardinality: "MANY" },
    { id: IDS.catStipend, companyId: IDS.acme, key: "stipend", name: "Stipend", cardinality: "MANY" },
    { id: IDS.catAppAccess, companyId: IDS.acme, key: "app_access", name: "Application Access", cardinality: "MANY" },
  ]);

  // ── Policies ──
  console.log("  Creating policies...");
  await db.insert(policies).values([
    { id: IDS.standardVacation, categoryId: IDS.catVacation, name: "Standard Vacation", description: "Standard vacation policy for all full-time employees" },
    { id: IDS.caVacation, categoryId: IDS.catVacation, name: "California Vacation", description: "Enhanced vacation for California-based full-time employees" },
    { id: IDS.extendedVacation, categoryId: IDS.catVacation, name: "Extended Vacation", description: "Extended vacation for employees with 2+ years tenure" },
    { id: IDS.standardSick, categoryId: IDS.catSickLeave, name: "Standard Sick", description: "Standard sick leave for all employees" },
    { id: IDS.usBiweekly, categoryId: IDS.catPaySchedule, name: "US Bi-weekly", description: "Bi-weekly pay schedule for US employees" },
    { id: IDS.standardHealthcare, categoryId: IDS.catHealthcare, name: "Standard Healthcare", description: "Standard healthcare plan for full-time employees" },
    { id: IDS.caWorkplaceTraining, categoryId: IDS.catCompliance, name: "CA Workplace Training", description: "California-mandated workplace training" },
    { id: IDS.managerTraining, categoryId: IDS.catCompliance, name: "Manager Training", description: "Required training for people managers" },
    { id: IDS.engineeringStipend, categoryId: IDS.catStipend, name: "Engineering Stipend", description: "Monitor and keyboard stipend for Engineering" },
    { id: IDS.github, categoryId: IDS.catAppAccess, name: "GitHub", description: "GitHub repository access" },
    { id: IDS.slack, categoryId: IDS.catAppAccess, name: "Slack", description: "Slack workspace access" },
    { id: IDS.notion, categoryId: IDS.catAppAccess, name: "Notion", description: "Notion workspace access" },
  ]);

  // ── Groups ──
  console.log("  Creating groups...");
  await db.insert(groups).values([
    { id: IDS.managers, companyId: IDS.acme, name: "Managers" },
  ]);

  // ── Group Memberships ──
  console.log("  Creating group memberships...");
  await db.insert(groupMemberships).values([
    { employeeId: IDS.sarah, groupId: IDS.managers, validFrom: "2024-08-28", validTo: null },
    { employeeId: IDS.daniel, groupId: IDS.managers, validFrom: "2022-03-01", validTo: null },
  ]);

  // ── Assignment Rules + Versions ──
  console.log("  Creating assignment rules and versions...");

  // Helper to create a rule and its initial published version
  const ruleData: Array<{
    ruleId: string;
    versionId: string;
    policyId: string;
    categoryId: string;
    name: string;
    predicate: Predicate;
    priority: number;
  }> = [
    {
      ruleId: IDS.ruleStandardVacation,
      versionId: IDS.rvStandardVacation,
      policyId: IDS.standardVacation,
      categoryId: IDS.catVacation,
      name: "Standard Vacation for Full-time",
      predicate: PREDICATES.fullTime,
      priority: 10,
    },
    {
      ruleId: IDS.ruleCaVacation,
      versionId: IDS.rvCaVacation,
      policyId: IDS.caVacation,
      categoryId: IDS.catVacation,
      name: "California Vacation",
      predicate: PREDICATES.caFullTime,
      priority: 50,
    },
    {
      ruleId: IDS.ruleExtendedVacation,
      versionId: IDS.rvExtendedVacation,
      policyId: IDS.extendedVacation,
      categoryId: IDS.catVacation,
      name: "Extended Vacation (2yr tenure)",
      predicate: PREDICATES.tenuredFullTime,
      priority: 60,
    },
    {
      ruleId: IDS.ruleStandardSick,
      versionId: IDS.rvStandardSick,
      policyId: IDS.standardSick,
      categoryId: IDS.catSickLeave,
      name: "Standard Sick Leave",
      predicate: PREDICATES.allEmployees,
      priority: 50,
    },
    {
      ruleId: IDS.ruleUsBiweekly,
      versionId: IDS.rvUsBiweekly,
      policyId: IDS.usBiweekly,
      categoryId: IDS.catPaySchedule,
      name: "US Bi-weekly Pay",
      predicate: PREDICATES.usEmployees,
      priority: 50,
    },
    {
      ruleId: IDS.ruleStandardHealthcare,
      versionId: IDS.rvStandardHealthcare,
      policyId: IDS.standardHealthcare,
      categoryId: IDS.catHealthcare,
      name: "Standard Healthcare",
      predicate: PREDICATES.fullTime,
      priority: 50,
    },
    {
      ruleId: IDS.ruleCaWorkplaceTraining,
      versionId: IDS.rvCaWorkplaceTraining,
      policyId: IDS.caWorkplaceTraining,
      categoryId: IDS.catCompliance,
      name: "CA Workplace Training",
      predicate: PREDICATES.caEmployees,
      priority: 50,
    },
    {
      ruleId: IDS.ruleManagerTraining,
      versionId: IDS.rvManagerTraining,
      policyId: IDS.managerTraining,
      categoryId: IDS.catCompliance,
      name: "Manager Training",
      predicate: PREDICATES.managersGroup,
      priority: 50,
    },
    {
      ruleId: IDS.ruleEngineeringStipend,
      versionId: IDS.rvEngineeringStipend,
      policyId: IDS.engineeringStipend,
      categoryId: IDS.catStipend,
      name: "Engineering Stipend",
      predicate: PREDICATES.engineering,
      priority: 50,
    },
    {
      ruleId: IDS.ruleGithub,
      versionId: IDS.rvGithub,
      policyId: IDS.github,
      categoryId: IDS.catAppAccess,
      name: "GitHub for Engineering",
      predicate: PREDICATES.engineering,
      priority: 50,
    },
    {
      ruleId: IDS.ruleSlack,
      versionId: IDS.rvSlack,
      policyId: IDS.slack,
      categoryId: IDS.catAppAccess,
      name: "Slack for Everyone",
      predicate: PREDICATES.allEmployees,
      priority: 50,
    },
    {
      ruleId: IDS.ruleNotion,
      versionId: IDS.rvNotion,
      policyId: IDS.notion,
      categoryId: IDS.catAppAccess,
      name: "Notion for Everyone",
      predicate: PREDICATES.allEmployees,
      priority: 50,
    },
  ];

  // Insert all rules
  await db.insert(assignmentRules).values(
    ruleData.map((r) => ({
      id: r.ruleId,
      companyId: IDS.acme,
      policyId: r.policyId,
      categoryId: r.categoryId,
      name: r.name,
      status: "ACTIVE",
      currentVersion: 1,
    })),
  );

  // Insert all rule versions
  await db.insert(assignmentRuleVersions).values(
    ruleData.map((r) => ({
      id: r.versionId,
      ruleId: r.ruleId,
      version: 1,
      predicate: r.predicate,
      priority: r.priority,
      effectiveFrom: "2024-01-01",
      effectiveTo: null,
      dependencies: extractDependencies(r.predicate),
      createdAt: new Date(),
      createdBy: "system:seed",
    })),
  );

  console.log("\n✅ Seed complete!");
  console.log(`   Company:    1 (Acme)`);
  console.log(`   Employees:  ${employeeData.length}`);
  console.log(`   Categories: 7`);
  console.log(`   Policies:   12`);
  console.log(`   Groups:     1 (Managers)`);
  console.log(`   Rules:      ${ruleData.length}`);
  console.log(`   Versions:   ${ruleData.length}`);

  if (closeConnection) {
    await sql.end();
  }
}

export { seed, IDS, PREDICATES };

// Only run automatically when executed directly as script
if (process.argv[1]?.replace(/\\/g, "/").includes("seed.ts")) {
  seed(true).catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
}
