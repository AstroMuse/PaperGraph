import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileText,
  ChevronRight,
  ChevronLeft,
  Plus,
  Trash2,
  Settings2,
  Share2,
  Info,
  Link as LinkIcon,
  X,
  Edit2,
  Check,
  AlertCircle,
  ArrowRight,
  ExternalLink,
  File,
  FolderOpen,
  LogOut,
  Clock
} from 'lucide-react';
import { PaperNode, PaperLink, RelationDefinition, DEFAULT_RELATIONS, Project } from './types';

const MAX_RADIUS = 60;
const MIN_RADIUS = 20;

// Uses /api in Prod (same origin), localhost:3001/api in Dev
const API_BASE = (import.meta as any).env.VITE_API_URL || 'http://localhost:3001/api';

export default function App() {
  // --- PROJECT STATE ---
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");

  // --- GRAPH STATE ---
  const [nodes, setNodes] = useState<PaperNode[]>([]);
  const [links, setLinks] = useState<PaperLink[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // New states for dynamic relations
  const [relations, setRelations] = useState<RelationDefinition[]>(DEFAULT_RELATIONS);
  const [activeRelationId, setActiveRelationId] = useState<string>(DEFAULT_RELATIONS[0].id);
  const [multiSelectNodeIds, setMultiSelectNodeIds] = useState<string[]>([]);
  const [isRelationEditorOpen, setIsRelationEditorOpen] = useState(false);
  const [alert, setAlert] = useState<{ message: string; type: 'success' | 'warning' } | null>(null);

  // Initial fetch: Load Projects when there is no active project
  useEffect(() => {
    if (!activeProjectId) {
      fetch(`${API_BASE}/projects`)
        .then(res => res.json())
        .then(data => setProjects(data || []))
        .catch(err => console.error("Failed to load projects:", err));
    }
  }, [activeProjectId]);

  // Initial fetch: Load Graph when a project is opened
  useEffect(() => {
    if (activeProjectId) {
      fetch(`${API_BASE}/projects/${activeProjectId}/graph`)
        .then(res => res.json())
        .then(data => {
          setNodes(data.nodes || []);
          setLinks(data.links || []);
        })
        .catch(err => console.error("Failed to load graph:", err));
    } else {
      // Clear graph on exit project
      setNodes([]);
      setLinks([]);
      setSelectedNodeId(null);
    }
  }, [activeProjectId]);

  // Project Management Methods
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName, description: newProjectDesc })
      });
      if (res.ok) {
        const newProj = await res.json();
        setProjects(prev => [newProj, ...prev]);
        setIsCreatingProject(false);
        setNewProjectName("");
        setNewProjectDesc("");
        // Automatically enter the new project
        setActiveProjectId(newProj.id);
      }
    } catch (err) { console.error("Create project failed", err); }
  };

  const handleDeleteProject = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("确定要彻底删除该项目及内部包含的所有图谱、PDF文件吗？此操作不可逆！")) return;
    try {
      await fetch(`${API_BASE}/projects/${id}`, { method: 'DELETE' });
      setProjects(prev => prev.filter(p => p.id !== id));
    } catch (err) { console.error("Delete project failed", err); }
  };

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    if (!activeProjectId) return; // Must be inside a project

    const files = Array.from(e.dataTransfer.files) as File[];
    const pdfs = files.filter(f => f.type === 'application/pdf');

    if (pdfs.length > 0) {
      const uploadedNodes: PaperNode[] = [];

      for (const file of pdfs) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('x', e.clientX.toString());
        formData.append('y', e.clientY.toString());

        try {
          const res = await fetch(`${API_BASE}/projects/${activeProjectId}/nodes`, {
            method: 'POST',
            body: formData
          });
          if (res.ok) {
            const newNode = await res.json();
            uploadedNodes.push(newNode);
          }
        } catch (error) {
          console.error("Upload failed", error);
        }
      }

      if (uploadedNodes.length > 0) {
        setNodes(prev => [...prev, ...uploadedNodes]);
        setAlert({ message: `成功导入 ${uploadedNodes.length} 篇论文，并已持久化至 Redis。`, type: 'success' });
        setTimeout(() => setAlert(null), 3000);
      }
    }
  };

  // Handle multi-select relation addition in a separate effect to avoid state setter nesting
  useEffect(() => {
    if (multiSelectNodeIds.length === 2) {
      addRelationBetween(multiSelectNodeIds[0], multiSelectNodeIds[1], activeRelationId);
      setMultiSelectNodeIds([]);
    }
  }, [multiSelectNodeIds, activeRelationId]);

  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<PaperNode, PaperLink> | null>(null);

  const selectedNode = useMemo(() =>
    nodes.find(n => n.id === selectedNodeId) || null
    , [nodes, selectedNodeId]);

  // Initialize D3 Simulation
  useEffect(() => {
    if (!svgRef.current || !activeProjectId) return; // Only run if a project is active

    const svg = d3.select(svgRef.current);
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Clear previous content
    svg.selectAll("*").remove();

    const g = svg.append("g");

    // Preserve positions from previous simulation if available
    const oldNodes: PaperNode[] = simulationRef.current?.nodes() || [];
    const nodeMap = new Map<string, PaperNode>(oldNodes.map(n => [n.id, n]));

    // Deep copy nodes and links for simulation to avoid React state mutation issues
    const maxCitations = Math.max(...nodes.map(n => n.citations), 1);
    const simulationNodes = nodes.map(n => {
      const old = nodeMap.get(n.id);
      const r = MIN_RADIUS + (n.citations / maxCitations) * (MAX_RADIUS - MIN_RADIUS);
      return {
        ...n,
        radius: r,
        x: old?.x ?? n.x ?? (width / 2 + (Math.random() - 0.5) * 100),
        y: old?.y ?? n.y ?? (height / 2 + (Math.random() - 0.5) * 100),
        vx: old?.vx ?? 0,
        vy: old?.vy ?? 0,
        fx: n.fx,
        fy: n.fy
      };
    });

    const simulationLinks = links.map(l => ({
      ...l,
      source: typeof l.source === 'string' ? l.source : (l.source as any).id,
      target: typeof l.target === 'string' ? l.target : (l.target as any).id
    }));

    const simulation = d3.forceSimulation<any>(simulationNodes)
      .force("link", d3.forceLink<any, any>(simulationLinks)
        .id(d => d.id)
        .distance(link => {
          if (link.type === 'similar') return 120;
          if (link.type === 'conflict') return 280;
          return 200;
        })
        .strength(link => {
          if (link.type === 'similar') return 0.5;
          return 0.1;
        })
      )
      .force("charge", d3.forceManyBody().strength(-1000))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide<any>().radius(d => d.radius + 40))
      .force("x", d3.forceX(width / 2).strength(0.1))
      .force("y", d3.forceY(height / 2).strength(0.1));

    simulationRef.current = simulation;

    // Draw links
    const linkSelection = g.append("g")
      .selectAll<SVGLineElement, any>("line")
      .data(simulationLinks)
      .join("line")
      .attr("stroke", (d: any) => {
        const rel = relations.find(r => r.id === d.type);
        return rel ? rel.color : "#94a3b8";
      })
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", 2)
      .attr("marker-end", (d: any) => {
        const rel = relations.find(r => r.id === d.type);
        return rel?.directed ? "url(#arrowhead)" : null;
      });

    // Arrowhead marker
    svg.append("defs").append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "-0 -5 10 10")
      .attr("refX", 10)
      .attr("refY", 0)
      .attr("orient", "auto")
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("xoverflow", "visible")
      .append("svg:path")
      .attr("d", "M 0,-5 L 10 ,0 L 0,5")
      .attr("fill", "#999")
      .style("stroke", "none");

    // Draw nodes
    const nodeSelection = g.append("g")
      .selectAll<SVGGElement, any>(".node")
      .data(simulationNodes)
      .join("g")
      .attr("class", "node")
      .call(drag(simulation) as any)
      .on("click", (event, d: any) => {
        event.stopPropagation();

        if (event.ctrlKey || event.metaKey) {
          setMultiSelectNodeIds(prev => {
            if (prev.includes(d.id)) return prev.filter(id => id !== d.id);
            return [...prev, d.id];
          });
        } else {
          setSelectedNodeId(d.id);
          setIsPanelOpen(true);
          setMultiSelectNodeIds([]);
        }
      });

    nodeSelection.append("circle")
      .attr("r", (d: any) => d.radius)
      .attr("fill", (d: any) => {
        if (multiSelectNodeIds.includes(d.id)) return "#fbbf24";
        return d.id === selectedNodeId ? "#3b82f6" : "#fff";
      })
      .attr("stroke", (d: any) => {
        if (multiSelectNodeIds.includes(d.id)) return "#d97706";
        return d.id === selectedNodeId ? "#2563eb" : "#3b82f6";
      })
      .attr("stroke-width", (d: any) => d.id === selectedNodeId ? 4 : 2)
      .style("filter", "drop-shadow(0 4px 12px rgba(0,0,0,0.08))")
      .style("cursor", "pointer");

    nodeSelection.append("path")
      .attr("d", "M-6 -8 L6 -8 L6 8 L-6 8 Z M-6 -4 L6 -4 M-6 0 L6 0 M-6 4 L2 4")
      .attr("stroke", (d: any) => d.id === selectedNodeId ? "#fff" : "#3b82f6")
      .attr("stroke-width", 1.5)
      .attr("fill", "none")
      .attr("opacity", 0.6)
      .style("pointer-events", "none");

    nodeSelection.append("text")
      .attr("dy", (d: any) => d.radius + 24)
      .attr("text-anchor", "middle")
      .attr("class", "node-label")
      .style("font-size", "13px")
      .style("font-weight", "600")
      .text((d: any) => d.name.length > 20 ? d.name.substring(0, 17) + "..." : d.name);

    simulation.on("tick", () => {
      linkSelection
        .attr("x1", (d: any) => d.source.x || 0)
        .attr("y1", (d: any) => d.source.y || 0)
        .attr("x2", (d: any) => {
          if (!d.source || !d.target || typeof d.source === 'string' || typeof d.target === 'string') return 0;
          const dx = d.target.x - d.source.x;
          const dy = d.target.y - d.source.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist === 0) return d.target.x || 0;
          const r = (d.target.radius || MIN_RADIUS) + 4;
          return (d.target.x || 0) - (dx * r / dist);
        })
        .attr("y2", (d: any) => {
          if (!d.source || !d.target || typeof d.source === 'string' || typeof d.target === 'string') return 0;
          const dx = d.target.x - d.source.x;
          const dy = d.target.y - d.source.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist === 0) return d.target.y || 0;
          const r = (d.target.radius || MIN_RADIUS) + 4;
          return (d.target.y || 0) - (dy * r / dist);
        });

      nodeSelection
        .attr("transform", (d: any) => `translate(${d.x || 0},${d.y || 0})`);
    });

    return () => {
      simulation.stop();
    };
  }, [nodes, links, selectedNodeId, relations, multiSelectNodeIds, activeRelationId, activeProjectId]);

  function getRadius(citations: number) {
    const maxCitations = Math.max(...nodes.map(n => n.citations), 1);
    return MIN_RADIUS + (citations / maxCitations) * (MAX_RADIUS - MIN_RADIUS);
  }

  function drag(simulation: d3.Simulation<any, any>) {
    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    return d3.drag<any, any>()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended);
  }

  const updateNode = async (id: string, updates: Partial<PaperNode>) => {
    if (!activeProjectId) return;
    setNodes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
    try {
      await fetch(`${API_BASE}/projects/${activeProjectId}/nodes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
    } catch (error) {
      console.error("Failed to update node", error);
    }
  };

  const deleteNode = async (id: string) => {
    if (!activeProjectId) return;
    setNodes(prev => prev.filter(n => n.id !== id));
    setLinks(prev => prev.filter(l => {
      const s = typeof l.source === 'string' ? l.source : (l.source as any).id;
      const t = typeof l.target === 'string' ? l.target : (l.target as any).id;
      return s !== id && t !== id;
    }));
    setSelectedNodeId(null);

    try {
      await fetch(`${API_BASE}/projects/${activeProjectId}/nodes/${id}`, { method: 'DELETE' });
    } catch (error) {
      console.error("Failed to delete node", error);
    }
  };

  const deleteLink = async (sourceId: string, targetId: string) => {
    if (!activeProjectId) return;
    setLinks(prev => prev.filter(l => {
      const s = typeof l.source === 'string' ? l.source : (l.source as any).id;
      const t = typeof l.target === 'string' ? l.target : (l.target as any).id;
      return !(s === sourceId && t === targetId) && !(s === targetId && t === sourceId);
    }));

    try {
      await fetch(`${API_BASE}/projects/${activeProjectId}/links`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: sourceId, target: targetId })
      });
    } catch (error) {
      console.error("Failed to delete link", error);
    }
  };

  const addRelation = (targetId: string, type: string) => {
    if (!selectedNodeId) return;
    addRelationBetween(selectedNodeId, targetId, type);
  };

  const addRelationBetween = async (sourceId: string, targetId: string, type: string) => {
    if (sourceId === targetId || !activeProjectId) return;

    // Check current state for immediate UI feedback
    const existsNow = links.some(l => {
      const s = typeof l.source === 'string' ? l.source : (l.source as any).id;
      const t = typeof l.target === 'string' ? l.target : (l.target as any).id;
      return (s === sourceId && t === targetId) || (s === targetId && t === sourceId);
    });

    if (existsNow) {
      setAlert({ message: "这两个节点之间已经存在逻辑关系了，无法建立多重关系。", type: 'warning' });
      setTimeout(() => setAlert(null), 4000);
      return;
    }

    const newLink = { source: sourceId, target: targetId, type };
    setLinks(prev => [...prev, newLink as unknown as PaperLink]);

    try {
      await fetch(`${API_BASE}/projects/${activeProjectId}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLink)
      });
      setAlert({ message: "逻辑关系建立成功并存于Redis中！", type: 'success' });
    } catch (error) {
      console.error("Failed to add link", error);
      setLinks(prev => prev.filter(l => l !== newLink));
    }

    setTimeout(() => setAlert(null), 3000);
  };

  // --- DASHBOARD RENDER ---
  if (!activeProjectId) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center py-16 px-6 relative overflow-hidden">
        {/* Background elements */}
        <div className="absolute top-0 w-full h-96 bg-gradient-to-b from-blue-600/10 to-transparent pointer-events-none" />

        <div className="w-full max-w-5xl z-10 flex flex-col gap-10">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30">
                <FileText className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">PaperGraph 工作区</h1>
                <p className="text-gray-500 font-medium">管理与分析您的所有学术论文图谱</p>
              </div>
            </div>
            <button
              onClick={() => setIsCreatingProject(true)}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all flex items-center gap-2"
            >
              <Plus className="w-5 h-5" /> 新建研究项目
            </button>
          </header>

          {/* Project List */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map(proj => (
              <div
                key={proj.id}
                onClick={() => setActiveProjectId(proj.id)}
                className="group bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer flex flex-col relative overflow-hidden"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <FolderOpen className="w-6 h-6" />
                  </div>
                  <button
                    onClick={(e) => handleDeleteProject(e, proj.id)}
                    className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2 truncate">{proj.name}</h3>
                <p className="text-gray-500 text-sm line-clamp-2 h-10 mb-6 flex-1">
                  {proj.description || '暂无简介...'}
                </p>
                <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 mt-auto pt-4 border-t border-gray-50">
                  <Clock className="w-4 h-4" />
                  {new Date(proj.createdAt).toLocaleDateString()}
                </div>

                <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-blue-400 to-blue-600 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
              </div>
            ))}
            {projects.length === 0 && (
              <div className="col-span-full py-20 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-3xl bg-white/50">
                <FolderOpen className="w-16 h-16 text-gray-300 mb-4" />
                <h3 className="text-xl font-bold text-gray-400">目前没有任何项目</h3>
                <p className="text-gray-400 text-sm mb-6">创建一个新的分析项目以开始您的学术研究吧！</p>
                <button
                  onClick={() => setIsCreatingProject(true)}
                  className="px-6 py-3 bg-white border border-gray-200 hover:border-blue-500 hover:text-blue-500 text-gray-600 font-bold rounded-2xl shadow-sm active:scale-95 transition-all flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" /> 首个项目
                </button>
              </div>
            )}
          </section>
        </div>

        {/* Modal -> Create Project */}
        <AnimatePresence>
          {isCreatingProject && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4"
              onClick={() => setIsCreatingProject(false)}
            >
              <motion.form
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                onClick={e => e.stopPropagation()}
                onSubmit={handleCreateProject}
                className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col"
              >
                <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-blue-500">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2"><FolderOpen className="w-5 h-5" /> 新建项目</h2>
                  <button type="button" onClick={() => setIsCreatingProject(false)} className="text-white/60 hover:text-white p-1 bg-white/10 rounded-full"><X className="w-5 h-5"/></button>
                </div>
                <div className="p-6 space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">项目名称 *</label>
                    <input
                      autoFocus
                      required
                      placeholder="例如：TSF通用模型争议"
                      value={newProjectName}
                      onChange={e => setNewProjectName(e.target.value)}
                      className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-3 font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">项目简介 (选填)</label>
                    <textarea
                      rows={3}
                      placeholder="例如：本项目分析TSF领域是否存在通用预测模型的学术争议..."
                      value={newProjectDesc}
                      onChange={e => setNewProjectDesc(e.target.value)}
                      className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-3 font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all resize-none"
                    />
                  </div>
                </div>
                <div className="p-6 bg-gray-50 flex gap-3">
                  <button type="button" onClick={() => setIsCreatingProject(false)} className="flex-1 py-3 font-bold text-gray-500 hover:bg-gray-200 bg-gray-100 rounded-xl transition-colors">取消</button>
                  <button type="submit" disabled={!newProjectName.trim()} className="flex-1 py-3 font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-lg shadow-blue-500/20 transition-all">创建项目</button>
                </div>
              </motion.form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // --- GRAPH RENDER ---
  return (
    <div
      className="relative w-screen h-screen overflow-hidden"
      onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
      onDragLeave={() => setIsDraggingFile(false)}
      onDrop={handleFileDrop}
    >
      {/* Background Grid is in index.css */}

      {/* Graph Canvas */}
      <svg
        ref={svgRef}
        id="graph-container"
        className={`w-full h-full transition-colors ${isDraggingFile ? 'bg-blue-50/50' : ''}`}
        onClick={() => { setSelectedNodeId(null); setIsPanelOpen(false); setMultiSelectNodeIds([]); }}
      />

      {/* Drag Overlay */}
      <AnimatePresence>
        {isDraggingFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] bg-blue-500/10 backdrop-blur-[2px] pointer-events-none flex items-center justify-center"
          >
            <div className="bg-white p-8 rounded-3xl shadow-2xl border-2 border-dashed border-blue-400 flex flex-col items-center gap-4">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <Plus className="w-8 h-8 text-blue-500 animate-bounce" />
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-gray-800">释放以导入 PDF 论文</p>
                <p className="text-sm text-gray-500">文件将自动关联至新生成的节点</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header UI Controls */}
      <div className="absolute left-6 top-6 z-40 flex items-center gap-3">
        {/* Back to dashboard button */}
        <button
          onClick={() => setActiveProjectId(null)}
          className="flex items-center gap-2 bg-white/90 hover:bg-white backdrop-blur-md px-4 py-2 rounded-2xl shadow-lg border border-black/5 font-bold text-gray-600 hover:text-blue-600 transition-colors"
        >
          <LogOut className="w-5 h-5 rotate-180" /> 返回
        </button>

        {/* Active Project Info */}
        <div className="bg-white/90 backdrop-blur-md px-5 py-2.5 rounded-2xl shadow-lg border border-black/5 flex flex-col justify-center">
          <span className="text-[10px] font-black uppercase text-blue-500 tracking-wider">当前工作区</span>
          <span className="text-sm font-bold text-gray-800 leading-tight">
            {projects.find(p => p.id === activeProjectId)?.name || '未知项目'}
          </span>
        </div>

        {/* Relation Selector */}
        <div className="flex items-center gap-2 bg-white/90 backdrop-blur-md p-2 rounded-2xl shadow-lg border border-black/5 ml-4">
          <div className="flex items-center gap-2 px-3 py-1 bg-gray-50 rounded-xl border border-black/5">
            <LinkIcon className="w-4 h-4 text-gray-400" />
            <select
              value={activeRelationId}
              onChange={(e) => setActiveRelationId(e.target.value)}
              className="bg-transparent text-sm font-semibold text-gray-700 focus:outline-none cursor-pointer"
            >
              {relations.map(rel => (
                <option key={rel.id} value={rel.id}>{rel.label}</option>
              ))}
            </select>
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: relations.find(r => r.id === activeRelationId)?.color }}
            />
          </div>
          <button
            onClick={() => setIsRelationEditorOpen(true)}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-400 hover:text-blue-500"
            title="管理关系类型"
          >
            <Edit2 className="w-4 h-4" />
          </button>
        </div>

        {multiSelectNodeIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-amber-500 text-white px-4 py-2 rounded-2xl shadow-lg text-sm font-bold flex items-center gap-2"
          >
            <div className="animate-pulse w-2 h-2 bg-white rounded-full" />
            已选中 {multiSelectNodeIds.length} 个节点，请点击第二个节点以建立关系
            <button onClick={() => setMultiSelectNodeIds([])} className="ml-2 hover:bg-white/20 rounded-full p-1">
              <X className="w-3 h-3" />
            </button>
          </motion.div>
        )}
      </div>

      {/* Relationship Editor Modal */}
      <AnimatePresence>
        {alert && (
          <motion.div
            initial={{ opacity: 0, y: -50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -50, x: '-50%' }}
            className="absolute top-24 left-1/2 z-[100] flex items-center gap-3 px-6 py-4 rounded-xl shadow-2xl border backdrop-blur-md min-w-[400px]"
            style={{
              backgroundColor: alert.type === 'success' ? '#edfdf1' : '#fffbeb',
              borderColor: alert.type === 'success' ? '#bbf7d0' : '#fef3c7',
              color: alert.type === 'success' ? '#166534' : '#92400e'
            }}
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/50">
              {alert.type === 'success' ? <Check className="w-5 h-5 text-green-500" /> : <AlertCircle className="w-5 h-5 text-amber-500" />}
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-sm">{alert.type === 'success' ? '操作成功' : '提示'}</span>
              <span className="text-xs opacity-80">{alert.message}</span>
            </div>
            <button onClick={() => setAlert(null)} className="ml-auto p-1 hover:bg-black/5 rounded-full">
              <X className="w-4 h-4 opacity-40" />
            </button>
          </motion.div>
        )}

        {isRelationEditorOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[60] flex items-center justify-center bg-black/20 backdrop-blur-sm p-6"
            onClick={() => setIsRelationEditorOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-800">管理逻辑关系类型</h3>
                <button onClick={() => setIsRelationEditorOpen(false)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1 space-y-4">
                {relations.map((rel, index) => (
                  <div key={rel.id} className="flex flex-col gap-3 bg-gray-50 p-4 rounded-2xl border border-black/5">
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={rel.color}
                        onChange={(e) => {
                          const newRels = [...relations];
                          newRels[index].color = e.target.value;
                          setRelations(newRels);
                        }}
                        className="w-8 h-8 rounded-lg overflow-hidden border-none cursor-pointer bg-transparent"
                      />
                      <input
                        type="text"
                        value={rel.label}
                        onChange={(e) => {
                          const newRels = [...relations];
                          newRels[index].label = e.target.value;
                          setRelations(newRels);
                        }}
                        className="flex-1 bg-transparent font-bold text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500/20 rounded px-2"
                      />
                      <button
                        onClick={() => {
                          if (relations.length <= 1) return;
                          setRelations(relations.filter(r => r.id !== rel.id));
                          if (activeRelationId === rel.id) setActiveRelationId(relations.find(r => r.id !== rel.id)!.id);
                        }}
                        className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between px-2">
                      <span className="text-xs text-gray-500 font-medium">有无指向性 (箭头)</span>
                      <button
                        onClick={() => {
                          const newRels = [...relations];
                          newRels[index].directed = !newRels[index].directed;
                          setRelations(newRels);
                        }}
                        className={`w-10 h-5 rounded-full transition-colors relative ${rel.directed ? 'bg-blue-500' : 'bg-gray-300'}`}
                      >
                        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${rel.directed ? 'left-6' : 'left-1'}`} />
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  onClick={() => {
                    const newId = `rel_${Math.random().toString(36).substr(2, 5)}`;
                    setRelations([...relations, { id: newId, label: "新关系", color: "#94a3b8", directed: true }]);
                  }}
                  className="w-full py-3 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 font-bold hover:border-blue-200 hover:text-blue-400 transition-all flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  新增关系类型
                </button>
              </div>

              <div className="p-6 bg-gray-50 border-t border-gray-100">
                <button
                  onClick={() => setIsRelationEditorOpen(false)}
                  className="w-full py-3 bg-blue-500 text-white rounded-2xl font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-600 transition-all"
                >
                  完成
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drag Overlay */}
      <AnimatePresence>
        {isDraggingFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-blue-500/10 backdrop-blur-sm border-4 border-dashed border-blue-500 m-4 rounded-3xl pointer-events-none"
          >
            <div className="text-center">
              <FileText className="w-20 h-20 text-blue-500 mx-auto mb-4 animate-bounce" />
              <h2 className="text-2xl font-bold text-blue-600">释放以导入 PDF 论文</h2>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Side Panel Toggle */}
      {!isPanelOpen && selectedNodeId && (
        <button
          onClick={() => setIsPanelOpen(true)}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/80 backdrop-blur-md rounded-full shadow-lg hover:bg-white transition-all z-40"
        >
          <ChevronLeft className="w-6 h-6 text-gray-600" />
        </button>
      )}

      {/* iOS Style Side Panel */}
      <AnimatePresence>
        {isPanelOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute right-0 top-0 h-full w-96 glass-panel z-50 flex flex-col p-6"
          >
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-500" />
                论文详情
              </h2>
              <button
                onClick={() => setIsPanelOpen(false)}
                className="p-2 hover:bg-black/5 rounded-full transition-colors"
              >
                <ChevronRight className="w-6 h-6 text-gray-400" />
              </button>
            </div>

            {selectedNode ? (
              <div className="flex-1 overflow-y-auto space-y-8 pr-2">
                {/* Basic Info */}
                <section className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">论文名称</label>
                    <input
                      type="text"
                      value={selectedNode.name}
                      onChange={(e) => updateNode(selectedNode.id, { name: e.target.value })}
                      className="w-full bg-white/50 border border-black/5 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">被引用量</label>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="0"
                        max="1000"
                        value={selectedNode.citations}
                        onChange={(e) => updateNode(selectedNode.id, { citations: parseInt(e.target.value) })}
                        className="flex-1 accent-blue-500"
                      />
                      <span className="text-sm font-mono font-bold text-blue-600 w-12 text-right">{selectedNode.citations}</span>
                    </div>
                  </div>
                </section>

                {/* Relations */}
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                      <LinkIcon className="w-3 h-3" /> 已有逻辑关系
                    </label>
                  </div>
                  <div className="space-y-2">
                    {links.filter(l => {
                      const s = typeof l.source === 'string' ? l.source : (l.source as any).id;
                      const t = typeof l.target === 'string' ? l.target : (l.target as any).id;
                      return s === selectedNode.id || t === selectedNode.id;
                    }).map((link, idx) => {
                      const sId = typeof link.source === 'string' ? link.source : (link.source as any).id;
                      const tId = typeof link.target === 'string' ? link.target : (link.target as any).id;
                      const otherId = sId === selectedNode.id ? tId : sId;
                      const otherNode = nodes.find(n => n.id === otherId);
                      const rel = relations.find(r => r.id === link.type);

                      return (
                        <div key={idx} className="flex items-center justify-between p-3 bg-white/40 rounded-xl border border-black/5">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: rel?.color }} />
                            <span className="text-xs font-bold text-gray-500 shrink-0">{rel?.label}:</span>
                            <span className="text-xs text-gray-700 truncate">{otherNode?.name || '未知节点'}</span>
                          </div>
                          <button
                            onClick={() => deleteLink(sId, tId)}
                            className="p-1 hover:bg-red-50 text-gray-300 hover:text-red-500 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                    {links.filter(l => {
                      const s = typeof l.source === 'string' ? l.source : (l.source as any).id;
                      const t = typeof l.target === 'string' ? l.target : (l.target as any).id;
                      return s === selectedNode.id || t === selectedNode.id;
                    }).length === 0 && (
                        <p className="text-xs text-gray-400 italic">暂无关联论文</p>
                      )}
                  </div>

                  <div className="flex items-center justify-between pt-4">
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                      <Plus className="w-3 h-3" /> 建立新逻辑关系
                    </label>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500 italic mb-2">点击下方论文并选择关系类型：</p>
                    <div className="grid grid-cols-1 gap-2">
                      {nodes.filter(n => n.id !== selectedNode.id).map(node => (
                        <div key={node.id} className="p-3 bg-white/40 rounded-xl border border-black/5 flex items-center justify-between group">
                          <span className="text-sm font-medium text-gray-700 truncate max-w-[150px]">{node.name}</span>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {relations.map((rel) => (
                              <button
                                key={rel.id}
                                onClick={() => addRelation(node.id, rel.id)}
                                className="w-6 h-6 rounded-full flex items-center justify-center hover:scale-110 transition-transform"
                                style={{ backgroundColor: rel.color }}
                                title={rel.label}
                              >
                                <Plus className="w-3 h-3 text-white" />
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                {/* Actions */}
                <section className="pt-8 border-t border-black/5 space-y-3">
                  {selectedNode.pdfUrl && (
                    <button
                      onClick={() => window.open(selectedNode.pdfUrl, '_blank')}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-all font-bold shadow-lg shadow-blue-500/20 active:scale-[0.98]"
                    >
                      <ExternalLink className="w-4 h-4" />
                      查看论文内容
                    </button>
                  )}
                  <button
                    onClick={() => deleteNode(selectedNode.id)}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-red-50 text-red-500 rounded-2xl hover:bg-red-100 transition-colors font-semibold"
                  >
                    <Trash2 className="w-4 h-4" />
                    删除节点
                  </button>
                  <button
                    onClick={async () => {
                      if (confirm("确定要清空当前项目中的图谱数据吗？只会清空知识节点，保留工作区。")) {
                        const nodelist = [...nodes];
                        setNodes([]);
                        setLinks([]);
                        setSelectedNodeId(null);

                        // Async clear in backend
                        for (const n of nodelist) {
                          try {
                            await fetch(`${API_BASE}/nodes/${n.id}`, { method: 'DELETE' });
                          } catch (e) { }
                        }
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-gray-100 text-gray-500 rounded-2xl hover:bg-gray-200 transition-colors font-semibold"
                  >
                    <X className="w-4 h-4" />
                    清空画布
                  </button>
                </section>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 space-y-4">
                <Info className="w-12 h-12 opacity-20" />
                <p className="text-sm text-center px-8">请在画布上选择一个节点以查看或编辑其详细信息。</p>
              </div>
            )}

            {/* Legend */}
            <div className="mt-auto pt-6 border-t border-black/5">
              <div className="grid grid-cols-2 gap-2">
                {relations.map((rel) => (
                  <div key={rel.id} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: rel.color }} />
                    <span className="text-xs text-gray-500">{rel.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Instructions */}
      <div className="absolute left-6 bottom-6 p-4 bg-white/60 backdrop-blur-md rounded-2xl border border-black/5 shadow-sm pointer-events-none">
        <h3 className="text-xs font-bold text-gray-800 uppercase tracking-widest mb-2">操作指南</h3>
        <ul className="text-[10px] text-gray-500 space-y-1">
          <li>• 拖拽 PDF 文件到此处导入论文</li>
          <li>• 点击节点编辑信息与建立逻辑关系</li>
          <li>• 拖拽节点调整布局</li>
          <li>• 滚轮缩放，按住空白处拖拽画布</li>
        </ul>
      </div>
    </div>
  );
}

