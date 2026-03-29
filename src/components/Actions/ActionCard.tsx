"use client";

import {
  Activity,
  RotateCcw,
  FileText,
  BarChart3,
  DollarSign,
  Monitor,
  HardDrive,
  Cpu,
  Trash2,
  Archive,
  Play,
  Loader2,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Zap,
} from "lucide-react";
import type { ActionDefinition } from "@/config/actions";
import type { ComponentType } from "react";

type IconProps = { className?: string; style?: React.CSSProperties };

const ICON_MAP: Record<string, ComponentType<IconProps>> = {
  Activity,
  RotateCcw,
  FileText,
  BarChart3,
  DollarSign,
  Monitor,
  HardDrive,
  Cpu,
  Trash2,
  Archive,
  AlertTriangle,
  Zap,
};

export interface ActionCardResult {
  status: "success" | "error";
  durationMs: number;
  timestamp: string;
}

interface ActionCardProps {
  action: ActionDefinition;
  categoryColor: string;
  isRunning: boolean;
  isDisabled: boolean;
  lastResult?: ActionCardResult;
  onRun: () => void;
  onViewResult: () => void;
}

export function ActionCard({
  action,
  categoryColor,
  isRunning,
  isDisabled,
  lastResult,
  onRun,
  onViewResult,
}: ActionCardProps) {
  const Icon = ICON_MAP[action.icon] || Zap;

  return (
    <div
      className="p-5 rounded-xl"
      style={{
        backgroundColor: "var(--card)",
        border: `1px solid ${
          lastResult
            ? lastResult.status === "success"
              ? "rgba(34,197,94,0.3)"
              : "rgba(239,68,68,0.3)"
            : "var(--border)"
        }`,
        transition: "border-color 0.3s",
      }}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div
          className="p-2 rounded-lg flex-shrink-0"
          style={{
            backgroundColor: `color-mix(in srgb, ${categoryColor} 15%, transparent)`,
          }}
        >
          <Icon className="w-5 h-5" style={{ color: categoryColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3
              className="font-semibold text-sm"
              style={{ color: "var(--text-primary)" }}
            >
              {action.name}
            </h3>
            {action.destructive && (
              <AlertTriangle
                className="w-3.5 h-3.5 flex-shrink-0"
                style={{ color: "var(--warning, #f59e0b)" }}
              />
            )}
          </div>
          <p
            className="text-xs mt-0.5"
            style={{ color: "var(--text-muted)" }}
          >
            {action.description}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: "var(--card-elevated)",
                color: "var(--text-muted)",
                fontSize: "0.65rem",
              }}
            >
              {action.role}+
            </span>
            {action.stream_output && (
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: "rgba(96,165,250,0.1)",
                  color: "#60A5FA",
                  fontSize: "0.65rem",
                }}
              >
                streaming
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Last result summary */}
      {lastResult && !isRunning && (
        <div
          className="flex items-center gap-2 mb-3 p-2 rounded-lg text-xs cursor-pointer"
          style={{
            backgroundColor:
              lastResult.status === "success"
                ? "rgba(34,197,94,0.1)"
                : "rgba(239,68,68,0.1)",
            color:
              lastResult.status === "success"
                ? "var(--success)"
                : "var(--error)",
          }}
          onClick={onViewResult}
        >
          {lastResult.status === "success" ? (
            <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          )}
          <span className="flex-1 truncate">
            {lastResult.status === "success" ? "Success" : "Failed"} ·{" "}
            {lastResult.durationMs}ms
          </span>
          <span style={{ color: "var(--text-muted)" }}>
            {new Date(lastResult.timestamp).toLocaleTimeString()}
          </span>
        </div>
      )}

      {/* Run button */}
      <button
        onClick={onRun}
        disabled={isRunning || isDisabled}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.5rem",
          padding: "0.625rem",
          borderRadius: "0.5rem",
          backgroundColor: isRunning
            ? `color-mix(in srgb, ${categoryColor} 20%, transparent)`
            : `color-mix(in srgb, ${categoryColor} 12%, transparent)`,
          color: categoryColor,
          border: `1px solid color-mix(in srgb, ${categoryColor} 25%, transparent)`,
          cursor: isRunning || isDisabled ? "not-allowed" : "pointer",
          fontSize: "0.875rem",
          fontWeight: 600,
          opacity: isDisabled && !isRunning ? 0.5 : 1,
          transition: "all 0.2s",
        }}
      >
        {isRunning ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Running...
          </>
        ) : (
          <>
            <Play className="w-4 h-4" />
            Run
          </>
        )}
      </button>
    </div>
  );
}
