/**
 * In-Memory Dependency Index for Scoped Incremental Reconciliation.
 * Build Spec §22, §26.
 *
 * Principles:
 * P3 — Dependency Indexing: Index predicates by referenced attributes, groups, and temporal dependencies.
 * Incremental evaluation only re-evaluates rules and categories affected by a mutation.
 */

import { extractDependencies, type Predicate } from "@warp/domain";
import type { EvaluatableRule } from "@warp/resolver";

export interface DependencyIndex {
  /** Map of attribute name (e.g. "state", "department") to Set of ruleIds */
  attributeToRules: Map<string, Set<string>>;
  /** Map of groupId to Set of ruleIds */
  groupToRules: Map<string, Set<string>>;
  /** Set of ruleIds with temporal/tenure dependencies */
  temporalRules: Set<string>;
  /** Map of ruleId to categoryId */
  ruleToCategory: Map<string, string>;
  /** Map of categoryId to Set of ruleIds */
  categoryToRules: Map<string, Set<string>>;

  /** Get category IDs affected by a list of changed employee attributes */
  getAffectedCategoriesForAttributes: (changedFields: string[]) => Set<string>;
  /** Get category IDs affected by a group membership change */
  getAffectedCategoriesForGroup: (groupId: string) => Set<string>;
  /** Get category IDs that contain temporal rules */
  getTemporalCategories: () => Set<string>;
  /** Check if a rule needs re-evaluation given changed fields */
  isRuleAffectedByAttributes: (ruleId: string, changedFields: string[]) => boolean;
}

/**
 * Build a DependencyIndex from a collection of active rules.
 */
export function buildDependencyIndex(rules: EvaluatableRule[]): DependencyIndex {
  const attributeToRules = new Map<string, Set<string>>();
  const groupToRules = new Map<string, Set<string>>();
  const temporalRules = new Set<string>();
  const ruleToCategory = new Map<string, string>();
  const categoryToRules = new Map<string, Set<string>>();

  for (const rule of rules) {
    const ruleId = rule.ruleId;
    const catId = rule.categoryId;

    ruleToCategory.set(ruleId, catId);

    if (!categoryToRules.has(catId)) {
      categoryToRules.set(catId, new Set());
    }
    categoryToRules.get(catId)!.add(ruleId);

    // Extract dependencies from the predicate AST
    const deps = extractDependencies(rule.predicate);

    for (const attr of deps.employeeFields) {
      if (!attributeToRules.has(attr)) {
        attributeToRules.set(attr, new Set());
      }
      attributeToRules.get(attr)!.add(ruleId);
    }

    for (const groupId of deps.groupIds) {
      if (!groupToRules.has(groupId)) {
        groupToRules.set(groupId, new Set());
      }
      groupToRules.get(groupId)!.add(ruleId);
    }

    if (deps.hasTemporalDependency) {
      temporalRules.add(ruleId);
    }
  }

  function getAffectedCategoriesForAttributes(changedFields: string[]): Set<string> {
    const affectedCategories = new Set<string>();

    for (const field of changedFields) {
      const matchingRules = attributeToRules.get(field);
      if (matchingRules) {
        for (const ruleId of matchingRules) {
          const catId = ruleToCategory.get(ruleId);
          if (catId) affectedCategories.add(catId);
        }
      }
    }

    return affectedCategories;
  }

  function getAffectedCategoriesForGroup(groupId: string): Set<string> {
    const affectedCategories = new Set<string>();
    const matchingRules = groupToRules.get(groupId);
    if (matchingRules) {
      for (const ruleId of matchingRules) {
        const catId = ruleToCategory.get(ruleId);
        if (catId) affectedCategories.add(catId);
      }
    }
    return affectedCategories;
  }

  function getTemporalCategories(): Set<string> {
    const affectedCategories = new Set<string>();
    for (const ruleId of temporalRules) {
      const catId = ruleToCategory.get(ruleId);
      if (catId) affectedCategories.add(catId);
    }
    return affectedCategories;
  }

  function isRuleAffectedByAttributes(ruleId: string, changedFields: string[]): boolean {
    for (const field of changedFields) {
      if (attributeToRules.get(field)?.has(ruleId)) {
        return true;
      }
    }
    return false;
  }

  return {
    attributeToRules,
    groupToRules,
    temporalRules,
    ruleToCategory,
    categoryToRules,
    getAffectedCategoriesForAttributes,
    getAffectedCategoriesForGroup,
    getTemporalCategories,
    isRuleAffectedByAttributes,
  };
}
