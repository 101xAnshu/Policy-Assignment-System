import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  Position,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { fetchEmployees, resolveEmployee, fetchCategories, previewEmployeeChange } from "../api";
import {
  User,
  ShieldCheck,
  Filter,
  Layers,
  Calendar,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
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

  // Live Simulation state (§37)
  const [simState, setSimState] = useState<string>("DEFAULT");

  // Load initial employees and categories
  useEffect(() => {
    fetchEmployees().then((data) => {
      setEmployees(data);
      if (data.length > 0) setSelectedEmpId(data[0].id);
    });
    fetchCategories().then(setCategories);
  }, []);

  // Run resolution or simulation on employee/date/state change
  const loadResolution = useCallback(async () => {
    if (!selectedEmpId) return;
    setLoading(true);
    try {
      if (simState === "DEFAULT") {
        const res = await resolveEmployee(selectedEmpId, date);
        setResolution(res);
      } else {
        // Run simulated attribute resolution (§37)
        const simRes = await previewEmployeeChange(
          selectedEmpId,
          { state: simState },
          date,
        );
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

  // Construct React Flow Nodes and Edges
  const { nodes, edges } = useMemo(() => {
    if (!resolution || !selectedEmployee) return { nodes: [], edges: [] };

    const nodeList: Node[] = [];
    const edgeList: Edge[] = [];

    const effectiveLocation =
      simState !== "DEFAULT" ? simState : selectedEmployee.state || selectedEmployee.country;

    // 1. Employee Node (X: 50, Y: 220)
    nodeList.push({
      id: "employee-root",
      position: { x: 50, y: 180 },
      data: {
        label: (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-white">{selectedEmployee.name}</span>
              {simState !== "DEFAULT" && (
                <span className="text-[9px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">
                  Simulated
                </span>
              )}
            </div>
            <div className="text-xs text-slate-300 flex items-center gap-1.5">
              <MapPin className="w-3 h-3 text-brand-400" />
              <span>Location: </span>
              <span className={`font-semibold ${simState !== "DEFAULT" ? "text-amber-300" : "text-white"}`}>
                {effectiveLocation}
              </span>
            </div>
            <div className="text-xs text-slate-400">Dept: {selectedEmployee.department}</div>
          </div>
        ),
      },
      type: "default",
      style: {
        background:
          simState !== "DEFAULT"
            ? "linear-gradient(135deg, #451a03 0%, #0f172a 100%)"
            : "linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)",
        color: "#fff",
        border: simState !== "DEFAULT" ? "1px solid #f59e0b" : "1px solid #6366f1",
        borderRadius: "16px",
        padding: "16px",
        width: 250,
        boxShadow:
          simState !== "DEFAULT"
            ? "0 10px 25px -5px rgba(245, 158, 11, 0.2)"
            : "0 10px 25px -5px rgba(99, 102, 241, 0.2)",
      },
    });

    // 2. Category & Rules Nodes (X: 380) & Assigned Policy Nodes (X: 750)
    let currentY = 50;

    (resolution.decisions || []).forEach((dec: any) => {
      const catId = `cat-${dec.categoryId}`;
      const isOne = dec.cardinality === "ONE";
      const isAmbiguous = dec.status === "AMBIGUOUS";
      const isEmpty = dec.status === "EMPTY";

      // Category / Decision Node
      nodeList.push({
        id: catId,
        position: { x: 380, y: currentY },
        data: {
          label: (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs uppercase tracking-wider text-slate-300">
                  {dec.categoryKey}
                </span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                  {dec.cardinality || (isOne ? "ONE" : "MANY")}
                </span>
              </div>
              <p className="text-xs text-slate-400 line-clamp-1">{dec.reason}</p>
            </div>
          ),
        },
        style: {
          background: "#0f172a",
          color: "#fff",
          border: isAmbiguous
            ? "1px solid #f43f5e"
            : isOne
            ? "1px solid #8b5cf6"
            : "1px solid #06b6d4",
          borderRadius: "14px",
          padding: "12px",
          width: 280,
        },
      });

      // Edge from Employee to Category
      edgeList.push({
        id: `e-emp-${catId}`,
        source: "employee-root",
        target: catId,
        animated: true,
        style: {
          stroke: simState !== "DEFAULT" ? "#f59e0b" : "#6366f1",
          strokeWidth: 1.5,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: simState !== "DEFAULT" ? "#f59e0b" : "#6366f1",
        },
      });

      // Policy Nodes for this Category
      const matchingAssignments = (resolution.assignments || []).filter(
        (a: any) => a.categoryId === dec.categoryId,
      );

      if (matchingAssignments.length === 0) {
        const noPolicyId = `no-policy-${dec.categoryId}`;
        nodeList.push({
          id: noPolicyId,
          position: { x: 740, y: currentY + 5 },
          data: { label: isAmbiguous ? "⚠️ Ambiguous Conflict" : "None Assigned" },
          style: {
            background: isAmbiguous ? "#4c0519" : "#1e293b",
            color: isAmbiguous ? "#fda4af" : "#94a3b8",
            border: isAmbiguous ? "1px solid #f43f5e" : "1px dashed #475569",
            borderRadius: "12px",
            padding: "8px 14px",
            width: 230,
            fontSize: "12px",
            fontWeight: isAmbiguous ? 700 : 400,
          },
        });

        edgeList.push({
          id: `e-${catId}-${noPolicyId}`,
          source: catId,
          target: noPolicyId,
          style: { stroke: isAmbiguous ? "#f43f5e" : "#475569", strokeDasharray: "4,4" },
        });
      } else {
        matchingAssignments.forEach((asgn: any, pIdx: number) => {
          const policyNodeId = `policy-${asgn.policyId}`;
          const isWinnerCandidate = dec.winner?.policyId === asgn.policyId;

          nodeList.push({
            id: policyNodeId,
            position: { x: 740, y: currentY + pIdx * 65 },
            data: {
              label: (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-xs text-white">Policy {asgn.policyId}</div>
                    <div className="text-[10px] text-emerald-300 font-mono">
                      Rule {asgn.sourceRuleId} (v{asgn.sourceRuleVersion})
                    </div>
                  </div>
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                </div>
              ),
            },
            style: {
              background: "linear-gradient(135deg, #064e3b 0%, #0f172a 100%)",
              color: "#34d399",
              border: "1px solid #10b981",
              borderRadius: "12px",
              padding: "10px 14px",
              width: 240,
              cursor: "pointer",
              boxShadow: "0 4px 15px -2px rgba(16, 185, 129, 0.15)",
            },
          });

          edgeList.push({
            id: `e-${catId}-${policyNodeId}`,
            source: catId,
            target: policyNodeId,
            animated: true,
            style: { stroke: "#10b981", strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: "#10b981" },
          });
        });
      }

      currentY += Math.max(100, matchingAssignments.length * 75);
    });

    return { nodes: nodeList, edges: edgeList };
  }, [resolution, selectedEmployee, simState]);

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] bg-background">
      {/* Top Toolbar */}
      <div className="px-6 py-4 border-b border-slate-800 bg-surface/80 backdrop-blur flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Employee Selector */}
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-brand-400" />
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Employee:
            </label>
            <select
              value={selectedEmpId}
              onChange={(e) => {
                setSelectedEmpId(e.target.value);
                setSimState("DEFAULT");
              }}
              className="bg-surface-raised border border-slate-700 text-white text-sm rounded-xl px-3 py-1.5 focus:outline-none focus:border-brand-500"
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.department} • {emp.state || emp.country})
                </option>
              ))}
            </select>
          </div>

          {/* Interactive Simulation Preset (§37) */}
          <div className="flex items-center gap-2 pl-3 border-l border-slate-800">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <label className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
              Simulate Move (§37):
            </label>
            <select
              value={simState}
              onChange={(e) => setSimState(e.target.value)}
              className={`text-xs rounded-xl px-3 py-1.5 border font-semibold focus:outline-none transition-all ${
                simState !== "DEFAULT"
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-md shadow-amber-500/10"
                  : "bg-surface-raised text-slate-300 border-slate-700 hover:text-white"
              }`}
            >
              <option value="DEFAULT">Current Actual Location</option>
              <option value="California">California (CA Vacation + Training)</option>
              <option value="New York">New York (Std Vacation)</option>
              <option value="Texas">Texas (Std Vacation)</option>
              <option value="Oregon">Oregon (Std Vacation)</option>
            </select>
          </div>

          {/* Point-in-time Date Picker */}
          <div className="flex items-center gap-2 pl-3 border-l border-slate-800">
            <Calendar className="w-4 h-4 text-cyan-400" />
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Effective Date:
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-surface-raised border border-slate-700 text-white text-sm rounded-xl px-3 py-1.5 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          {/* Quick Scenario Preset Buttons */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
            <button
              onClick={() => setDate("2024-08-28")}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                date === "2024-08-28"
                  ? "bg-brand-500/20 text-brand-300 border border-brand-500/30"
                  : "bg-surface-raised text-slate-400 hover:text-white"
              }`}
            >
              Hire Date (2024)
            </button>
            <button
              onClick={() => setDate("2026-08-28")}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                date === "2026-08-28"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                  : "bg-surface-raised text-slate-400 hover:text-white"
              }`}
            >
              24-Mo Tenure (2026)
            </button>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center gap-4 text-xs">
          {resolution && (
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-emerald-400 font-medium bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {resolution.assignments?.length || 0} Policies Resolved
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Main React Flow Canvas */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 z-10 bg-background/50 backdrop-blur-xs flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
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
          minZoom={0.2}
          maxZoom={1.5}
        >
          <Background color="#1e293b" gap={20} size={1} />
          <Controls className="!bg-surface-raised !border-slate-700 !fill-white" />
          <MiniMap
            nodeStrokeColor="#8b5cf6"
            nodeColor="#1e293b"
            maskColor="rgba(8, 12, 20, 0.7)"
            className="!bg-surface !border-slate-800 rounded-xl overflow-hidden"
          />
        </ReactFlow>
      </div>

      {/* "Why?" Explainability Modal */}
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
