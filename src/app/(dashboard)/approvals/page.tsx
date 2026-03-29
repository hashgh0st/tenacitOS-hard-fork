"use client";

import { useState, useEffect, useCallback } from "react";
import { ShieldCheck, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { ApprovalCard } from "@/components/Approvals/ApprovalCard";
import type { ApprovalRequest } from "@/lib/gateway/types";

const POLL_INTERVAL_MS = 10_000;

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const fetchApprovals = useCallback(async () => {
    try {
      const res = await fetch("/api/approvals");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to fetch approvals (${res.status})`);
      }
      const data = await res.json();
      setApprovals(data.approvals || []);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load approvals",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  // Polling
  useEffect(() => {
    const interval = setInterval(fetchApprovals, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchApprovals]);

  const pending = approvals.filter((a) => a.status === "pending");
  const resolved = approvals.filter((a) => a.status !== "pending");

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div
            className="flex items-center gap-2 animate-pulse text-lg"
            style={{ color: "var(--text-muted)" }}
          >
            <Loader2 className="animate-spin" style={{ width: "20px", height: "20px" }} />
            Loading approvals...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1
          className="text-3xl font-bold mb-2"
          style={{
            fontFamily: "var(--font-heading)",
            color: "var(--text-primary)",
            letterSpacing: "-1.5px",
          }}
        >
          <ShieldCheck className="inline-block w-8 h-8 mr-2 mb-1" />
          Approvals
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
          Agent action approval requests{" "}
          {pending.length > 0 && (
            <span
              style={{
                color: "var(--warning, #f59e0b)",
                fontWeight: 600,
              }}
            >
              — {pending.length} pending
            </span>
          )}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            border: "1px solid var(--error, #ef4444)",
            borderRadius: "0.75rem",
            padding: "1rem",
            marginBottom: "1.5rem",
            color: "var(--error, #ef4444)",
            fontSize: "0.9rem",
          }}
        >
          {error}
        </div>
      )}

      {/* Pending approvals */}
      {pending.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center"
          style={{
            padding: "4rem 2rem",
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "0.75rem",
          }}
        >
          <ShieldCheck
            style={{
              width: "48px",
              height: "48px",
              color: "var(--text-muted)",
              marginBottom: "1rem",
            }}
          />
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: "1.1rem",
              fontWeight: 500,
            }}
          >
            No pending approvals
          </p>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: "0.85rem",
              marginTop: "0.25rem",
            }}
          >
            Approval requests from agents will appear here
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {pending.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              onResponded={fetchApprovals}
            />
          ))}
        </div>
      )}

      {/* History section */}
      {resolved.length > 0 && (
        <div style={{ marginTop: "2rem" }}>
          <button
            onClick={() => setShowHistory((prev) => !prev)}
            className="flex items-center gap-2"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-secondary)",
              fontSize: "0.95rem",
              fontWeight: 600,
              padding: "0.5rem 0",
            }}
          >
            {showHistory ? (
              <ChevronDown style={{ width: "18px", height: "18px" }} />
            ) : (
              <ChevronRight style={{ width: "18px", height: "18px" }} />
            )}
            History ({resolved.length})
          </button>

          {showHistory && (
            <div className="grid gap-3" style={{ marginTop: "0.75rem" }}>
              {resolved.map((approval) => (
                <ApprovalCard key={approval.id} approval={approval} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
