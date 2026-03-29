"use client";

import { useState } from "react";
import { Pencil, Trash2, Loader2 } from "lucide-react";
import type { AlertRule } from "@/lib/alerts/types";

const OPERATOR_LABELS: Record<string, string> = {
  gt: ">",
  lt: "<",
  eq: "=",
  gte: ">=",
  lte: "<=",
};

const METRIC_LABELS: Record<string, string> = {
  "system.cpu": "CPU",
  "system.ram": "RAM",
  "system.disk": "Disk",
  "cost.daily.total": "Daily Cost",
  "gateway.status": "Gateway Status",
};

const SEVERITY_STYLES: Record<string, { color: string; bg: string }> = {
  critical: { color: "#ef4444", bg: "rgba(239, 68, 68, 0.12)" },
  warning: { color: "#f59e0b", bg: "rgba(245, 158, 11, 0.12)" },
  info: { color: "#3b82f6", bg: "rgba(59, 130, 246, 0.12)" },
};

function formatCondition(rule: AlertRule): string {
  const metric = METRIC_LABELS[rule.condition.metric] ?? rule.condition.metric;
  const op = OPERATOR_LABELS[rule.condition.operator] ?? rule.condition.operator;
  const unit =
    rule.condition.metric === "cost.daily.total"
      ? "$"
      : rule.condition.metric.startsWith("system.")
        ? "%"
        : "";
  if (unit === "$") {
    return `${metric} ${op} $${rule.condition.value}`;
  }
  return `${metric} ${op} ${rule.condition.value}${unit}`;
}

interface RuleCardProps {
  rule: AlertRule;
  onEdit: (rule: AlertRule) => void;
  onDeleted: () => void;
  onToggled: () => void;
}

export function RuleCard({ rule, onEdit, onDeleted, onToggled }: RuleCardProps) {
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const severityStyle = SEVERITY_STYLES[rule.severity] ?? SEVERITY_STYLES.info;

  async function handleToggle() {
    setToggling(true);
    try {
      const res = await fetch(`/api/alerts/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      if (res.ok) {
        onToggled();
      }
    } catch {
      // Silently ignore
    } finally {
      setToggling(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`/api/alerts/${rule.id}`, { method: "DELETE" });
      if (res.ok) {
        onDeleted();
      }
    } catch {
      // Silently ignore
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div
      className="rounded-xl p-4"
      style={{
        backgroundColor: "var(--card)",
        border: "1px solid var(--border)",
        opacity: rule.enabled ? 1 : 0.6,
      }}
    >
      {/* Top row: name + severity badge */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3
            className="text-sm font-semibold truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {rule.name}
          </h3>
          <p
            className="text-xs mt-1"
            style={{ color: "var(--text-secondary)", fontFamily: "monospace" }}
          >
            {formatCondition(rule)}
          </p>
        </div>
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full ml-2 flex-shrink-0"
          style={{
            color: severityStyle.color,
            backgroundColor: severityStyle.bg,
          }}
        >
          {rule.severity}
        </span>
      </div>

      {/* Channels */}
      <div className="flex flex-wrap gap-1 mb-3">
        {rule.channels.map((ch) => (
          <span
            key={ch}
            className="text-xs px-2 py-0.5 rounded"
            style={{
              backgroundColor: "var(--surface-elevated, rgba(255,255,255,0.05))",
              color: "var(--text-muted)",
            }}
          >
            {ch}
          </span>
        ))}
      </div>

      {/* Actions row */}
      <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: "var(--border)" }}>
        {/* Toggle switch */}
        <button
          onClick={handleToggle}
          disabled={toggling}
          className="relative flex items-center"
          style={{ cursor: toggling ? "wait" : "pointer", background: "none", border: "none" }}
          title={rule.enabled ? "Disable rule" : "Enable rule"}
        >
          <div
            className="w-9 h-5 rounded-full transition-colors relative"
            style={{
              backgroundColor: rule.enabled ? "var(--accent, #6366f1)" : "var(--border, #374151)",
            }}
          >
            <div
              className="absolute top-0.5 w-4 h-4 rounded-full transition-transform bg-white"
              style={{
                transform: rule.enabled ? "translateX(18px)" : "translateX(2px)",
              }}
            />
          </div>
          <span
            className="text-xs ml-2"
            style={{ color: "var(--text-muted)" }}
          >
            {toggling ? <Loader2 className="w-3 h-3 animate-spin" /> : rule.enabled ? "On" : "Off"}
          </span>
        </button>

        {/* Edit + Delete */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(rule)}
            className="p-1.5 rounded-md transition-colors"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
            }}
            title="Edit rule"
          >
            <Pencil className="w-4 h-4" />
          </button>

          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs px-2 py-1 rounded font-medium"
                style={{
                  backgroundColor: "var(--error, #ef4444)",
                  color: "#fff",
                  border: "none",
                  cursor: deleting ? "wait" : "pointer",
                }}
              >
                {deleting ? "..." : "Confirm"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs px-2 py-1 rounded"
                style={{
                  backgroundColor: "var(--surface-elevated, rgba(255,255,255,0.05))",
                  color: "var(--text-muted)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={handleDelete}
              className="p-1.5 rounded-md transition-colors"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)",
              }}
              title="Delete rule"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
