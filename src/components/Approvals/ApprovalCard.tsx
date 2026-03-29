"use client";

import { useState, useEffect } from "react";
import { CheckCircle, XCircle, Loader2, ChevronDown, ChevronRight, Clock } from "lucide-react";
import type { ApprovalRequest } from "@/lib/gateway/types";

interface ApprovalCardProps {
  approval: ApprovalRequest;
  onResponded?: () => void;
}

export function ApprovalCard({ approval, onResponded }: ApprovalCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<"approved" | "denied" | null>(null);
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");
  const [timeLeft, setTimeLeft] = useState("");

  // Countdown timer
  useEffect(() => {
    function updateCountdown() {
      const now = Date.now();
      const expires = new Date(approval.expiresAt).getTime();
      const diff = expires - now;

      if (diff <= 0) {
        setTimeLeft("Expired");
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      if (minutes > 60) {
        const hours = Math.floor(minutes / 60);
        const remainMinutes = minutes % 60;
        setTimeLeft(`${hours}h ${remainMinutes}m`);
      } else {
        setTimeLeft(`${minutes}m ${seconds}s`);
      }
    }

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [approval.expiresAt]);

  const handleRespond = async (action: "approve" | "deny") => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvalId: approval.id,
          action,
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to ${action} (${res.status})`);
      }

      setResult(action === "approve" ? "approved" : "denied");
      onResponded?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred",
      );
    } finally {
      setLoading(false);
    }
  };

  const isPending = approval.status === "pending" && !result;
  const isExpired = timeLeft === "Expired";

  return (
    <div
      style={{
        backgroundColor: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "0.75rem",
        padding: "1.25rem",
        opacity: isPending && !isExpired ? 1 : 0.7,
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: "0.25rem" }}>
            <span
              style={{
                fontWeight: 600,
                color: "var(--text-primary)",
                fontSize: "0.95rem",
              }}
            >
              {approval.agentName}
            </span>
            <span
              style={{
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                fontFamily: "monospace",
              }}
            >
              {approval.agentId}
            </span>
          </div>
          <div
            style={{
              color: "var(--text-secondary)",
              fontSize: "0.9rem",
              fontWeight: 500,
              marginBottom: "0.5rem",
            }}
          >
            {approval.action}
          </div>
          {approval.context && (
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: "0.85rem",
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              {approval.context}
            </p>
          )}
        </div>

        {/* Countdown */}
        <div
          className="flex items-center gap-1"
          style={{
            color: isExpired
              ? "var(--error, #ef4444)"
              : "var(--warning, #f59e0b)",
            fontSize: "0.8rem",
            fontWeight: 600,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          <Clock style={{ width: "14px", height: "14px" }} />
          {timeLeft}
        </div>
      </div>

      {/* Result display */}
      {result && (
        <div
          className="flex items-center gap-2"
          style={{
            marginTop: "1rem",
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            backgroundColor:
              result === "approved"
                ? "rgba(74, 222, 128, 0.1)"
                : "rgba(239, 68, 68, 0.1)",
            color:
              result === "approved"
                ? "var(--success, #4ade80)"
                : "var(--error, #ef4444)",
            fontSize: "0.85rem",
            fontWeight: 500,
          }}
        >
          {result === "approved" ? (
            <CheckCircle style={{ width: "16px", height: "16px" }} />
          ) : (
            <XCircle style={{ width: "16px", height: "16px" }} />
          )}
          {result === "approved" ? "Approved" : "Denied"}
        </div>
      )}

      {/* Error */}
      {error && (
        <p
          style={{
            color: "var(--error, #ef4444)",
            fontSize: "0.85rem",
            marginTop: "0.75rem",
            marginBottom: 0,
          }}
        >
          {error}
        </p>
      )}

      {/* Actions (only for pending approvals) */}
      {isPending && !isExpired && (
        <div style={{ marginTop: "1rem" }}>
          {/* Optional note toggle */}
          <button
            onClick={() => setShowNote((prev) => !prev)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              fontSize: "0.8rem",
              padding: 0,
              marginBottom: showNote ? "0.5rem" : "0.75rem",
            }}
          >
            {showNote ? (
              <ChevronDown style={{ width: "14px", height: "14px" }} />
            ) : (
              <ChevronRight style={{ width: "14px", height: "14px" }} />
            )}
            Add note
          </button>

          {showNote && (
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note..."
              disabled={loading}
              style={{
                width: "100%",
                padding: "0.5rem 0.75rem",
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
                backgroundColor: "var(--card-elevated, var(--surface))",
                color: "var(--text-primary)",
                fontSize: "0.85rem",
                outline: "none",
                boxSizing: "border-box",
                marginBottom: "0.75rem",
              }}
            />
          )}

          {/* Approve / Deny buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => handleRespond("approve")}
              disabled={loading}
              style={{
                flex: 1,
                padding: "0.5rem 1rem",
                borderRadius: "0.5rem",
                background: loading
                  ? "var(--card-elevated, var(--surface))"
                  : "var(--success, #4ade80)",
                color: loading ? "var(--text-muted)" : "#fff",
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                fontWeight: 600,
                fontSize: "0.9rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              {loading ? (
                <Loader2
                  className="animate-spin"
                  style={{ width: "14px", height: "14px" }}
                />
              ) : (
                <CheckCircle style={{ width: "14px", height: "14px" }} />
              )}
              Approve
            </button>
            <button
              onClick={() => handleRespond("deny")}
              disabled={loading}
              style={{
                flex: 1,
                padding: "0.5rem 1rem",
                borderRadius: "0.5rem",
                background: loading
                  ? "var(--card-elevated, var(--surface))"
                  : "var(--error, #ef4444)",
                color: loading ? "var(--text-muted)" : "#fff",
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                fontWeight: 600,
                fontSize: "0.9rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              {loading ? (
                <Loader2
                  className="animate-spin"
                  style={{ width: "14px", height: "14px" }}
                />
              ) : (
                <XCircle style={{ width: "14px", height: "14px" }} />
              )}
              Deny
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
