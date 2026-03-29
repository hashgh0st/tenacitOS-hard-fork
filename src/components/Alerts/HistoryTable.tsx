"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { AlertHistoryEntry } from "@/lib/alerts/types";

const PAGE_SIZE = 20;

const SEVERITY_STYLES: Record<string, { color: string; bg: string }> = {
  critical: { color: "#ef4444", bg: "rgba(239, 68, 68, 0.12)" },
  warning: { color: "#f59e0b", bg: "rgba(245, 158, 11, 0.12)" },
  info: { color: "#3b82f6", bg: "rgba(59, 130, 246, 0.12)" },
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatDuration(firedAt: string, resolvedAt: string | null): string {
  if (!resolvedAt) return "Ongoing";
  try {
    const ms = new Date(resolvedAt).getTime() - new Date(firedAt).getTime();
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
    return `${(ms / 3_600_000).toFixed(1)}h`;
  } catch {
    return "-";
  }
}

export function HistoryTable() {
  const [entries, setEntries] = useState<AlertHistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async (currentOffset: number) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/alerts/history?limit=${PAGE_SIZE}&offset=${currentOffset}`,
      );
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
        setTotal(data.total || 0);
      }
    } catch {
      // Silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory(offset);
  }, [offset, fetchHistory]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (loading && entries.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2
          className="w-8 h-8 animate-spin"
          style={{ color: "var(--accent)" }}
        />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div
        className="text-center py-12 rounded-xl"
        style={{
          backgroundColor: "var(--card)",
          border: "1px solid var(--border)",
        }}
      >
        <p style={{ color: "var(--text-muted)" }}>No alert history yet</p>
      </div>
    );
  }

  return (
    <div>
      <div
        className="rounded-xl overflow-hidden"
        style={{
          backgroundColor: "var(--card)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Fired At", "Rule Name", "Severity", "Message", "Status", "Duration"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-xs font-semibold"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const sev = SEVERITY_STYLES[entry.severity] ?? SEVERITY_STYLES.info;
                const isActive = !entry.resolvedAt;

                return (
                  <tr
                    key={entry.id}
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <td
                      className="px-4 py-3 whitespace-nowrap"
                      style={{ color: "var(--text-secondary)", fontSize: "12px" }}
                    >
                      {formatDate(entry.firedAt)}
                    </td>
                    <td
                      className="px-4 py-3"
                      style={{ color: "var(--text-primary)", fontWeight: 500 }}
                    >
                      {entry.ruleName}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ color: sev.color, backgroundColor: sev.bg }}
                      >
                        {entry.severity}
                      </span>
                    </td>
                    <td
                      className="px-4 py-3 max-w-xs truncate"
                      style={{ color: "var(--text-secondary)", fontSize: "12px" }}
                    >
                      {entry.message}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-xs font-medium">
                        {isActive ? (
                          <>
                            <span
                              className="w-2 h-2 rounded-full animate-pulse"
                              style={{ backgroundColor: "#ef4444" }}
                            />
                            <span style={{ color: "#ef4444" }}>Active</span>
                          </>
                        ) : (
                          <span style={{ color: "var(--success, #22c55e)" }}>Resolved</span>
                        )}
                      </span>
                    </td>
                    <td
                      className="px-4 py-3 whitespace-nowrap"
                      style={{ color: "var(--text-muted)", fontSize: "12px" }}
                    >
                      {formatDuration(entry.firedAt, entry.resolvedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0}
              className="p-1.5 rounded-md"
              style={{
                backgroundColor: "var(--surface-elevated, rgba(255,255,255,0.05))",
                border: "1px solid var(--border)",
                cursor: offset === 0 ? "not-allowed" : "pointer",
                opacity: offset === 0 ? 0.4 : 1,
                color: "var(--text-secondary)",
              }}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Page {page} / {totalPages}
            </span>
            <button
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={page >= totalPages}
              className="p-1.5 rounded-md"
              style={{
                backgroundColor: "var(--surface-elevated, rgba(255,255,255,0.05))",
                border: "1px solid var(--border)",
                cursor: page >= totalPages ? "not-allowed" : "pointer",
                opacity: page >= totalPages ? 0.4 : 1,
                color: "var(--text-secondary)",
              }}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
