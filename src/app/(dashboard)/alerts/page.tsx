"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, Plus, Loader2 } from "lucide-react";
import { RuleCard } from "@/components/Alerts/RuleCard";
import { RuleEditor } from "@/components/Alerts/RuleEditor";
import { HistoryTable } from "@/components/Alerts/HistoryTable";
import type { AlertRule } from "@/lib/alerts/types";

type Tab = "rules" | "history";

export default function AlertsPage() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("rules");
  const [editorRule, setEditorRule] = useState<AlertRule | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts");
      if (res.ok) {
        const data = await res.json();
        setRules(data.rules || []);
      }
    } catch {
      // Silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  function openCreate() {
    setEditorRule(null);
    setShowEditor(true);
  }

  function openEdit(rule: AlertRule) {
    setEditorRule(rule);
    setShowEditor(true);
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "rules", label: "Rules" },
    { id: "history", label: "History" },
  ];

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1
            className="text-3xl font-bold mb-2"
            style={{
              fontFamily: "var(--font-heading)",
              color: "var(--text-primary)",
              letterSpacing: "-1.5px",
            }}
          >
            <Bell className="inline-block w-8 h-8 mr-2 mb-1" />
            Alerts
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
            Configure alert rules and view alert history
          </p>
        </div>

        {tab === "rules" && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
            style={{
              backgroundColor: "var(--accent, #6366f1)",
              color: "#fff",
              border: "none",
              cursor: "pointer",
            }}
          >
            <Plus className="w-4 h-4" />
            Create Rule
          </button>
        )}
      </div>

      {/* Tabs */}
      <div
        className="flex gap-2 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        {tabs.map((t) => {
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-4 py-2 font-medium transition-all text-sm"
              style={{
                color: isActive ? "var(--accent)" : "var(--text-secondary)",
                background: "none",
                border: "none",
                borderBottomWidth: "2px",
                borderBottomStyle: "solid",
                borderBottomColor: isActive ? "var(--accent)" : "transparent",
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Rules tab */}
      {tab === "rules" && (
        <>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2
                className="w-8 h-8 animate-spin"
                style={{ color: "var(--accent)" }}
              />
            </div>
          ) : rules.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-16 rounded-xl"
              style={{
                backgroundColor: "var(--card)",
                border: "1px solid var(--border)",
              }}
            >
              <Bell
                className="w-12 h-12 mb-4"
                style={{ color: "var(--text-muted)" }}
              />
              <p
                className="text-lg font-medium mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                No alert rules configured
              </p>
              <p
                className="text-sm mb-4"
                style={{ color: "var(--text-muted)" }}
              >
                Create your first rule to start monitoring
              </p>
              <button
                onClick={openCreate}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                style={{
                  backgroundColor: "var(--accent, #6366f1)",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <Plus className="w-4 h-4" />
                Create Rule
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rules.map((rule) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  onEdit={openEdit}
                  onDeleted={fetchRules}
                  onToggled={fetchRules}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* History tab */}
      {tab === "history" && <HistoryTable />}

      {/* Rule editor modal */}
      {showEditor && (
        <RuleEditor
          rule={editorRule}
          onClose={() => setShowEditor(false)}
          onSaved={fetchRules}
        />
      )}
    </div>
  );
}
