"use client";

import { useState, useRef, useEffect } from "react";
import {
  Play,
  Square,
  RotateCw,
  Terminal,
  MoreVertical,
  Box,
} from "lucide-react";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import type { DockerContainer } from "@/lib/docker/types";

interface ContainerCardProps {
  container: DockerContainer;
  canAct: boolean;
  onViewLogs: (id: string, name: string) => void;
}

type ContainerAction = "start" | "stop" | "restart";

function stateColor(state: string): string {
  switch (state) {
    case "running":
      return "var(--success)";
    case "exited":
    case "dead":
      return "var(--error)";
    case "paused":
      return "var(--warning)";
    default:
      return "var(--text-muted)";
  }
}

function stateBg(state: string): string {
  switch (state) {
    case "running":
      return "rgba(34,197,94,0.12)";
    case "exited":
    case "dead":
      return "rgba(239,68,68,0.12)";
    case "paused":
      return "rgba(234,179,8,0.12)";
    default:
      return "var(--card-elevated)";
  }
}

function formatPorts(ports: DockerContainer["Ports"]): string {
  if (!ports || ports.length === 0) return "";
  return ports
    .filter((p) => p.PublicPort)
    .map((p) => `${p.PublicPort}:${p.PrivatePort}/${p.Type}`)
    .join(", ");
}

function containerName(names: string[]): string {
  if (!names || names.length === 0) return "unnamed";
  // Docker prefixes names with "/" — strip it
  return names[0].replace(/^\//, "");
}

export function ContainerCard({
  container,
  canAct,
  onViewLogs,
}: ContainerCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirm, setConfirm] = useState<{
    action: ContainerAction;
    label: string;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const name = containerName(container.Names);
  const ports = formatPorts(container.Ports);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  async function performAction(action: ContainerAction) {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/docker/${container.Id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json();
        console.error("Container action failed:", data.error || data.details);
      }
    } catch (err) {
      console.error("Container action error:", err);
    } finally {
      setActionLoading(false);
      setConfirm(null);
    }
  }

  function handleMenuAction(action: ContainerAction | "logs") {
    setMenuOpen(false);
    if (action === "logs") {
      onViewLogs(container.Id, name);
      return;
    }
    if (action === "stop" || action === "restart") {
      setConfirm({
        action,
        label: action === "stop" ? "Stop Container" : "Restart Container",
      });
      return;
    }
    // start doesn't need confirmation
    performAction(action);
  }

  return (
    <>
      <div
        className="p-4 rounded-xl"
        style={{
          backgroundColor: "var(--card)",
          border: "1px solid var(--border)",
        }}
      >
        {/* Header row */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="p-2 rounded-lg flex-shrink-0"
              style={{ backgroundColor: "var(--card-elevated)" }}
            >
              <Box
                className="w-5 h-5"
                style={{ color: stateColor(container.State) }}
              />
            </div>
            <div className="min-w-0">
              <h4
                className="font-semibold truncate"
                style={{ color: "var(--text-primary)" }}
              >
                {name}
              </h4>
              <p
                className="text-sm truncate"
                style={{ color: "var(--text-secondary)" }}
              >
                {container.Image}
              </p>
            </div>
          </div>

          {canAct && (
            <div className="relative flex-shrink-0" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                disabled={actionLoading}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "0.25rem",
                  color: "var(--text-muted)",
                }}
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 rounded-lg py-1 z-10"
                  style={{
                    backgroundColor: "var(--surface-elevated)",
                    border: "1px solid var(--border)",
                    minWidth: "140px",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                  }}
                >
                  {container.State !== "running" && (
                    <button
                      onClick={() => handleMenuAction("start")}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--success)",
                        textAlign: "left",
                      }}
                    >
                      <Play className="w-3.5 h-3.5" /> Start
                    </button>
                  )}
                  {container.State === "running" && (
                    <button
                      onClick={() => handleMenuAction("stop")}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--error)",
                        textAlign: "left",
                      }}
                    >
                      <Square className="w-3.5 h-3.5" /> Stop
                    </button>
                  )}
                  <button
                    onClick={() => handleMenuAction("restart")}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--text-secondary)",
                      textAlign: "left",
                    }}
                  >
                    <RotateCw className="w-3.5 h-3.5" /> Restart
                  </button>
                  <button
                    onClick={() => handleMenuAction("logs")}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--text-secondary)",
                      textAlign: "left",
                    }}
                  >
                    <Terminal className="w-3.5 h-3.5" /> View Logs
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* State badge + status text */}
        <div className="flex items-center gap-2 mb-2">
          <span
            className="px-2 py-0.5 rounded text-xs font-medium"
            style={{
              backgroundColor: stateBg(container.State),
              color: stateColor(container.State),
            }}
          >
            {container.State}
          </span>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {container.Status}
          </span>
        </div>

        {/* Ports */}
        {ports && (
          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
            <span style={{ color: "var(--text-muted)" }}>Ports: </span>
            <span className="font-mono">{ports}</span>
          </div>
        )}
      </div>

      {/* Confirmation dialog */}
      {confirm && (
        <ConfirmDialog
          title={confirm.label}
          message={`Are you sure you want to ${confirm.action} container "${name}"?`}
          confirmLabel={confirm.label}
          onConfirm={() => performAction(confirm.action)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}
