import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { fetchEmployees, resolveEmployee, fetchCategories, previewEmployeeChange } from "../api";
import {
  User,
  Calendar,
  CheckCircle2,
  MapPin,
  RefreshCw,
} from "lucide-react";
import { WhyModal } from "./WhyModal";

export const ResolutionGraph: React.FC = () => {
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [date, setDate] = useState<string>("2024-08-28");
  const [categories, setCategories] = useState<any[]>([]);
  const [resolution, setResolution] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [inspectPolicy, setInspectPolicy] = useState<{ id: string; name: string } | null>(null);
  const [simState, setSimState] = useState<string>("DEFAULT");

  useEffect(() => {
    fetchEmployees().then((data) => {
      setEmployees(data);
      if (data.length > 0) setSelectedEmpId(data[0].id);
    });
    fetchCategories().then(setCategories);
  }, []);

  const loadResolution = useCallback(async () => {
    if (!selectedEmpId) return;
    setLoading(true);
    try {
      if (simState === "DEFAULT") {
        const res = await resolveEmployee(selectedEmpId, date);
        setResolution(res);
      } else {
        const simRes = await previewEmployeeChange(selectedEmpId, { state: simState }, date);
        setResolution({
          employeeId: selectedEmpId,
          evaluationDate: date,
          assignments: simRes.desiredAssignments,
          decisions: simRes.decisions,
          isSimulated: true,
          simulatedState: simState,
        });
      }
    } catch (err) {
      console.error("Resolution error:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedEmpId, date, simState]);

  useEffect(() => {
    loadResolution();
  }, [loadResolution]);

  const selectedEmployee = employees.find((e) => e.id === selectedEmpId);

  const { nodes, edges } = useMemo(() => {
    if (!resolution || !selectedEmployee) return { nodes: [], edges: [] };

    const nodeList: Node[] = [];
    const edgeList: Edge[] = [];

    const effectiveLocation = simState !== "DEFAULT" ? simState : selectedEmployee.state || selectedEmployee.country;
    const isSimulated = simState !== "DEFAULT";
    const accentColor = isSimulated ? "#f5a623" : "#e8772e";
    const neutralBorder = "#3a3a3a";

    // Employee node
    nodeList.push({
      id: "employee-root",
      position: { x: 50, y: 180 },
      data: {
        label: (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-secondary" />
                <span className="font-heading font-semibold text-sm text-primary">{selectedEmployee.name}</span>
              </div>
              {isSimulated && (
                <span className="text-[9px] font-medium bg-status-warning/15 text-status-warning px-1.5 py-0.5 rounded">
                  Simulated
                </span>
              )}
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
              <span className="text-tertiary">dept</span>
              <span className="text-primary">{selectedEmployee.department}</span>
              <span className="text-tertiary">state</span>
              <span className={isSimulated ? "text-status-warning font-medium" : "text-primary"}>{effectiveLocation}</span>
              <span className="text-tertiary">type</span>
              <span className="text-primary">{selectedEmployee.employmentType || "FULL_TIME"}</span>
              {selectedEmployee.isManager && (
                <>
                  <span className="text-tertiary">role</span>
                  <span className="text-primary">Manager</span>
                </>
              )}
            </div>
          </div>
        ),
      },
      type: "default",
      style: {
        background: "#242424",
        color: "#e8e8e8",
        border: `1px solid ${isSimulated ? "#f5a623" : neutralBorder}`,
        borderRadius: "8px",
        padding: "14px",
        width: 220,
      },
    });

    // Resolve node
    const resolveY = 200;
    nodeList.push({
      id: "resolver",
      position: { x: 380, y: resolveY },
      data: {
        label: (
          <div className="text-center space-y-1">
            <span className="font-heading font-semibold text-xs text-accent">Resolve</span>
            <div className="text-[10px] text-tertiary">
              one per slot · priority wins
            </div>
          </div>
        ),
      },
      style: {
        background: "#2e2e2e",
        color: "#e8e8e8",
        border: `1px solid ${accentColor}`,
        borderRadius: "8px",
        padding: "10px 16px",
        width: 150,
      },
    });

    // Edge from employee to resolver
    edgeList.push({
      id: "e-emp-resolver",
      source: "employee-root",
      target: "resolver",
      style: { stroke: accentColor, strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: accentColor, width: 12, height: 12 },
    });

    // Category decisions → assignment nodes
    let currentY = 30;
    const assignmentPolicies: any[] = [];

    (resolution.decisions || []).forEach((dec: any) => {
      const catId = `cat-${dec.categoryId}`;
      const isAmbiguous = dec.status === "AMBIGUOUS";

      // Category rule node — connecting to resolver
      nodeList.push({
        id: catId,
        position: { x: 580, y: currentY },
        data: {
          label: (
            <div className="space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="font-medium text-xs text-primary">{dec.categoryKey}</span>
                <span className="text-[9px] font-mono text-tertiary px-1 py-0.5 rounded bg-background border border-border">
                  {dec.cardinality || "ONE"}
                </span>
              </div>
              <p className="text-[10px] text-tertiary truncate">{dec.reason}</p>
            </div>
          ),
        },
        style: {
          background: "#242424",
          color: "#e8e8e8",
          border: `1px solid ${isAmbiguous ? "#e5484d" : neutralBorder}`,
          borderRadius: "8px",
          padding: "10px 12px",
          width: 220,
        },
      });

      // Edge from resolver to category
      edgeList.push({
        id: `e-resolver-${catId}`,
        source: "resolver",
        target: catId,
        style: { stroke: neutralBorder, strokeWidth: 1 },
        markerEnd: { type: MarkerType.ArrowClosed, color: neutralBorder, width: 10, height: 10 },
      });

      // Policy assignment nodes
      const matchingAssignments = (resolution.assignments || []).filter(
        (a: any) => a.categoryId === dec.categoryId,
      );

      if (matchingAssignments.length === 0) {
        const noPolicyId = `no-policy-${dec.categoryId}`;
        nodeList.push({
          id: noPolicyId,
          position: { x: 860, y: currentY + 5 },
          data: { label: isAmbiguous ? "Ambiguous conflict" : "None assigned" },
          style: {
            background: isAmbiguous ? "#3a2020" : "#2e2e2e",
            color: isAmbiguous ? "#e5484d" : "#666",
            border: isAmbiguous ? "1px solid #e5484d" : "1px dashed #3a3a3a",
            borderRadius: "8px",
            padding: "8px 12px",
            width: 170,
            fontSize: "11px",
          },
        });
        edgeList.push({
          id: `e-${catId}-${noPolicyId}`,
          source: catId,
          target: noPolicyId,
          style: { stroke: isAmbiguous ? "#e5484d" : "#3a3a3a", strokeDasharray: "4,4" },
        });
      } else {
        matchingAssignments.forEach((asgn: any, pIdx: number) => {
          const policyNodeId = `policy-${asgn.policyId}`;
          assignmentPolicies.push(asgn);

          nodeList.push({
            id: policyNodeId,
            position: { x: 860, y: currentY + pIdx * 55 },
            data: {
              label: (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-primary">{asgn.policyName || `Policy ${asgn.policyId}`}</div>
                    <div className="text-[10px] text-tertiary font-mono">
                      v{asgn.sourceRuleVersion}
                    </div>
                  </div>
                  <CheckCircle2 className="w-3 h-3 text-status-success flex-shrink-0" />
                </div>
              ),
            },
            style: {
              background: "#242424",
              color: "#e8e8e8",
              border: `1px solid ${accentColor}`,
              borderRadius: "8px",
              padding: "8px 12px",
              width: 200,
              cursor: "pointer",
            },
          });

          edgeList.push({
            id: `e-${catId}-${policyNodeId}`,
            source: catId,
            target: policyNodeId,
            style: { stroke: accentColor, strokeWidth: 1.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color: accentColor, width: 10, height: 10 },
          });
        });
      }

      currentY += Math.max(85, matchingAssignments.length * 60);
    });

    return { nodes: nodeList, edges: edgeList };
  }, [resolution, selectedEmployee, simState]);

  return (
    <div className="flex flex-col flex-1 bg-background">
      {/* Toolbar */}
      <div className="px-5 py-3 border-b border-border bg-surface flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Employee selector */}
          <div className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-secondary" />
            <select
              value={selectedEmpId}
              onChange={(e) => { setSelectedEmpId(e.target.value); setSimState("DEFAULT"); }}
              className="bg-surface-raised border border-border text-primary text-[13px] rounded px-2.5 py-1.5 focus:outline-none focus:border-accent"
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.department} · {emp.state || emp.country})
                </option>
              ))}
            </select>
          </div>

          {/* Simulate location */}
          <div className="flex items-center gap-1.5 pl-3 border-l border-border">
            <MapPin className="w-3.5 h-3.5 text-secondary" />
            <span className="text-xs text-secondary">Simulate:</span>
            <select
              value={simState}
              onChange={(e) => setSimState(e.target.value)}
              className={`text-[13px] rounded px-2.5 py-1.5 border focus:outline-none transition-colors ${
                simState !== "DEFAULT"
                  ? "bg-status-warning/10 text-status-warning border-status-warning/30"
                  : "bg-surface-raised text-secondary border-border hover:text-primary"
              }`}
            >
              <option value="DEFAULT">Current location</option>
              <option value="California">California</option>
              <option value="New York">New York</option>
              <option value="Texas">Texas</option>
              <option value="Oregon">Oregon</option>
            </select>
          </div>

          {/* Date picker */}
          <div className="flex items-center gap-1.5 pl-3 border-l border-border">
            <Calendar className="w-3.5 h-3.5 text-secondary" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-surface-raised border border-border text-primary text-[13px] rounded px-2.5 py-1.5 focus:outline-none focus:border-accent font-mono"
            />
          </div>

          {/* Quick presets */}
          <div className="flex items-center gap-1 pl-3 border-l border-border">
            <button
              onClick={() => setDate("2024-08-28")}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                date === "2024-08-28" ? "bg-accent/10 text-accent" : "text-secondary hover:text-primary"
              }`}
            >
              Hire date
            </button>
            <button
              onClick={() => setDate("2026-08-28")}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                date === "2026-08-28" ? "bg-accent/10 text-accent" : "text-secondary hover:text-primary"
              }`}
            >
              24-month
            </button>
          </div>
        </div>

        {/* Status */}
        {resolution && (
          <div className="flex items-center gap-1.5 text-xs text-status-success">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {resolution.assignments?.length || 0} policies resolved
          </div>
        )}
      </div>

      {/* Graph Canvas */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 z-10 bg-background/60 flex items-center justify-center">
            <RefreshCw className="w-5 h-5 animate-spin text-accent" />
          </div>
        )}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodeClick={(_evt, node) => {
            if (node.id.startsWith("policy-") && selectedEmployee) {
              const policyId = node.id.replace("policy-", "");
              setInspectPolicy({ id: policyId, name: `Policy ${policyId}` });
            }
          }}
          fitView
          minZoom={0.3}
          maxZoom={1.5}
        >
          <Background color="#2e2e2e" gap={24} size={1} />
          <Controls />
          <MiniMap
            nodeStrokeColor="#e8772e"
            nodeColor="#2e2e2e"
            maskColor="rgba(26, 26, 26, 0.8)"
          />
        </ReactFlow>
      </div>

      {/* Why modal */}
      {inspectPolicy && selectedEmployee && (
        <WhyModal
          employeeId={selectedEmployee.id}
          employeeName={selectedEmployee.name}
          policyId={inspectPolicy.id}
          policyName={inspectPolicy.name}
          date={date}
          onClose={() => setInspectPolicy(null)}
        />
      )}
    </div>
  );
};
