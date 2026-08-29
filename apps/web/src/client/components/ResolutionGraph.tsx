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
import { fetchEmployees, resolveEmployee, fetchCategories } from "../api";
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

  // Load initial employees and categories
  useEffect(() => {
    fetchEmployees().then((data) => {
      setEmployees(data);
      if (data.length > 0) setSelectedEmpId(data[0].id);
    });
    fetchCategories().then(setCategories);
  }, []);

  // Run resolution on employee/date change
  const loadResolution = useCallback(async () => {
    if (!selectedEmpId) return;
    setLoading(true);
    try {
      const res = await resolveEmployee(selectedEmpId, date);
      setResolution(res);
    } catch (err) {
      console.error("Resolution error:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedEmpId, date]);

  useEffect(() => {
    loadResolution();
  }, [loadResolution]);

  const selectedEmployee = employees.find((e) => e.id === selectedEmpId);

  // Construct React Flow Nodes and Edges
  const { nodes, edges } = useMemo(() => {
    if (!resolution || !selectedEmployee) return { nodes: [], edges: [] };

    const nodeList: Node[] = [];
    const edgeList: Edge[] = [];

    // 1. Employee Node (X: 50, Y: 200)
    nodeList.push({
      id: "employee-root",
      position: { x: 50, y: 180 },
      data: { label: selectedEmployee.name },
      type: "default",
      style: {
        background: "linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)",
        color: "#fff",
        border: "1px solid #6366f1",
        borderRadius: "16px",
        padding: "16px",
        width: 240,
        boxShadow: "0 10px 25px -5px rgba(99, 102, 241, 0.2)",
      },
    });

    // 2. Category & Rules Nodes (X: 380) & Assigned Policy Nodes (X: 750)
    let currentY = 50;

    resolution.decisions.forEach((dec: any, idx: number) => {
      const catId = `cat-${dec.categoryId}`;
      const isOne = dec.cardinality === "ONE";
      const hasConflict = dec.status === "AMBIGUOUS";

      // Category / Decision Node
      nodeList.push({
        id: catId,
        position: { x: 380, y: currentY },
        data: { label: dec.categoryName },
        style: {
          background: "#0f172a",
          color: "#fff",
          border: hasConflict
            ? "1px solid #f43f5e"
            : isOne
            ? "1px solid #8b5cf6"
            : "1px solid #06b6d4",
          borderRadius: "14px",
          padding: "14px",
          width: 280,
        },
      });

      // Edge from Employee to Category
      edgeList.push({
        id: `e-emp-${catId}`,
        source: "employee-root",
        target: catId,
        animated: true,
        style: { stroke: "#6366f1", strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#6366f1" },
      });

      // Policy Nodes for this Category
      if (dec.policies.length === 0) {
        const noPolicyId = `no-policy-${dec.categoryId}`;
        nodeList.push({
          id: noPolicyId,
          position: { x: 740, y: currentY + 10 },
          data: { label: "None Assigned" },
          style: {
            background: "#1e293b",
            color: "#94a3b8",
            border: "1px dashed #475569",
            borderRadius: "12px",
            padding: "10px 16px",
            width: 220,
            fontSize: "13px",
          },
        });

        edgeList.push({
          id: `e-${catId}-${noPolicyId}`,
          source: catId,
          target: noPolicyId,
          style: { stroke: "#475569", strokeDasharray: "4,4" },
        });
      } else {
        dec.policies.forEach((p: any, pIdx: number) => {
          const policyNodeId = `policy-${p.id}`;
          nodeList.push({
            id: policyNodeId,
            position: { x: 740, y: currentY + pIdx * 70 },
            data: { label: p.name },
            style: {
              background: "linear-gradient(135deg, #064e3b 0%, #0f172a 100%)",
              color: "#34d399",
              border: "1px solid #10b981",
              borderRadius: "12px",
              padding: "12px 16px",
              width: 230,
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

      currentY += Math.max(120, dec.policies.length * 80);
    });

    return { nodes: nodeList, edges: edgeList };
  }, [resolution, selectedEmployee]);

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
              onChange={(e) => setSelectedEmpId(e.target.value)}
              className="bg-surface-raised border border-slate-700 text-white text-sm rounded-xl px-3 py-1.5 focus:outline-none focus:border-brand-500"
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.department} • {emp.state || emp.country})
                </option>
              ))}
            </select>
          </div>

          {/* Point-in-time Date Picker */}
          <div className="flex items-center gap-2">
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
              Hire Date (Aug 2024)
            </button>
            <button
              onClick={() => setDate("2026-08-28")}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                date === "2026-08-28"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                  : "bg-surface-raised text-slate-400 hover:text-white"
              }`}
            >
              24-Mo Tenure (Aug 2026)
            </button>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center gap-4 text-xs">
          {resolution && (
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-emerald-400 font-medium bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {resolution.assignedPolicyCount} Policies Resolved
              </span>
              {resolution.hasAmbiguities && (
                <span className="flex items-center gap-1.5 text-rose-400 font-medium bg-rose-950/40 px-2.5 py-1 rounded-lg border border-rose-500/20">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Ambiguity Detected
                </span>
              )}
            </div>
          )}
          <span className="text-slate-400 flex items-center gap-1">
            <Info className="w-3.5 h-3.5" /> Click any policy node for "Why?" reasoning
          </span>
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
            if (node.id.startsWith("policy-")) {
              const policyId = node.id.replace("policy-", "");
              setInspectPolicy({ id: policyId, name: node.data.label as string });
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
