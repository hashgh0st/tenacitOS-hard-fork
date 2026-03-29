"use client";

import { useState, useCallback } from "react";
import { ACTIONS, CATEGORIES, type ActionDefinition, type ActionCategory } from "@/config/actions";
import { ActionCard, type ActionCardResult } from "@/components/Actions/ActionCard";
import { ActionOutput } from "@/components/Actions/ActionOutput";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

interface ActionExecutionResult {
  actionId: string;
  actionName: string;
  status: "success" | "error" | "streaming";
  output: string;
  durationMs?: number;
  timestamp: string;
  executionId?: string;
}

export default function ActionsPage() {
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ActionExecutionResult>>({});
  const [selectedResult, setSelectedResult] = useState<ActionExecutionResult | null>(null);
  const [confirmAction, setConfirmAction] = useState<ActionDefinition | null>(null);

  const runAction = useCallback((action: ActionDefinition) => {
    if (action.destructive) {
      setConfirmAction(action);
      return;
    }
    executeAction(action);
  }, []);

  const executeAction = useCallback(async (action: ActionDefinition) => {
    setConfirmAction(null);
    setRunning(action.id);

    try {
      const res = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: action.id }),
      });
      const data = await res.json();

      if (res.status === 403) {
        const result: ActionExecutionResult = {
          actionId: action.id,
          actionName: action.name,
          status: "error",
          output: data.message || data.error || "Forbidden",
          timestamp: new Date().toISOString(),
        };
        setResults((prev) => ({ ...prev, [action.id]: result }));
        setSelectedResult(result);
        return;
      }

      const result: ActionExecutionResult = {
        actionId: data.actionId ?? action.id,
        actionName: action.name,
        status: data.status,
        output: data.output ?? "",
        durationMs: data.duration_ms,
        timestamp: data.timestamp ?? new Date().toISOString(),
        executionId: data.executionId,
      };
      setResults((prev) => ({ ...prev, [action.id]: result }));
      setSelectedResult(result);
    } catch {
      const result: ActionExecutionResult = {
        actionId: action.id,
        actionName: action.name,
        status: "error",
        output: "Network error",
        timestamp: new Date().toISOString(),
      };
      setResults((prev) => ({ ...prev, [action.id]: result }));
    } finally {
      setRunning(null);
    }
  }, []);

  // Group actions by category
  const grouped = (Object.keys(CATEGORIES) as ActionCategory[]).map((cat) => ({
    category: cat,
    ...CATEGORIES[cat],
    actions: ACTIONS.filter((a) => a.category === cat),
  }));

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="mb-8">
        <h1
          className="text-3xl font-bold mb-2"
          style={{
            fontFamily: "var(--font-heading)",
            color: "var(--text-primary)",
          }}
        >
          Quick Actions Hub
        </h1>
        <p style={{ color: "var(--text-secondary)" }}>
          Run predefined maintenance and diagnostic tasks with one click
        </p>
      </div>

      {/* Grouped action cards */}
      {grouped.map((group) => (
        <div key={group.category} className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: group.color }}
            />
            <h2
              className="text-sm font-semibold uppercase tracking-wider"
              style={{ color: group.color }}
            >
              {group.label}
            </h2>
            <div
              className="flex-1 h-px"
              style={{ backgroundColor: "var(--border)" }}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {group.actions.map((action) => {
              const result = results[action.id];
              const lastResult: ActionCardResult | undefined =
                result && result.status !== "streaming"
                  ? {
                      status: result.status,
                      durationMs: result.durationMs ?? 0,
                      timestamp: result.timestamp,
                    }
                  : undefined;

              return (
                <ActionCard
                  key={action.id}
                  action={action}
                  categoryColor={group.color}
                  isRunning={running === action.id}
                  isDisabled={running !== null && running !== action.id}
                  lastResult={lastResult}
                  onRun={() => runAction(action)}
                  onViewResult={() => {
                    if (result) setSelectedResult(result);
                  }}
                />
              );
            })}
          </div>
        </div>
      ))}

      {/* Confirm Dialog for destructive actions */}
      {confirmAction && (
        <ConfirmDialog
          title={`Confirm: ${confirmAction.name}`}
          message="This action may affect running services or delete data. Are you sure you want to proceed?"
          confirmLabel="Run Anyway"
          onConfirm={() => executeAction(confirmAction)}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {/* Output modal */}
      {selectedResult && (
        <ActionOutput
          actionName={selectedResult.actionName}
          output={selectedResult.output}
          status={selectedResult.status}
          durationMs={selectedResult.durationMs}
          timestamp={selectedResult.timestamp}
          executionId={selectedResult.executionId}
          onClose={() => setSelectedResult(null)}
        />
      )}
    </div>
  );
}
