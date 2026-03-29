"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MoreVertical, Play, Square, RotateCcw, MessageSquare, Cpu, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { MessageModal } from "@/components/Agents/MessageModal";
import { ModelSwapModal } from "@/components/Agents/ModelSwapModal";

interface AgentActionDropdownProps {
  agentId: string;
  agentName: string;
  currentModel?: string;
}

type ActionType = "start" | "stop" | "restart";

export function AgentActionDropdown({
  agentId,
  agentName,
  currentModel,
}: AgentActionDropdownProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ActionType | null>(null);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [showModelModal, setShowModelModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Only visible to operators and admins
  if (!user || (user.role !== "operator" && user.role !== "admin")) {
    return null;
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Clear error after 5 seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  const executeAction = useCallback(
    async (action: ActionType) => {
      setLoading(true);
      setError(null);
      setConfirmAction(null);
      setOpen(false);

      try {
        const res = await fetch(`/api/agents/${agentId}/control`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (res.status === 503) {
            throw new Error(
              "Agent gateway is unavailable. The gateway service may be down or unreachable.",
            );
          }
          throw new Error(data.error || `Action failed (${res.status})`);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "An unexpected error occurred",
        );
      } finally {
        setLoading(false);
      }
    },
    [agentId],
  );

  const handleMenuClick = (action: ActionType) => {
    if (action === "stop" || action === "restart") {
      setConfirmAction(action);
      setOpen(false);
    } else {
      executeAction(action);
    }
  };

  const menuItems = [
    { action: "start" as const, label: "Start", icon: Play, color: "var(--success, #4ade80)" },
    { action: "stop" as const, label: "Stop", icon: Square, color: "var(--error, #ef4444)" },
    { action: "restart" as const, label: "Restart", icon: RotateCcw, color: "var(--warning, #f59e0b)" },
  ];

  return (
    <>
      <div ref={dropdownRef} style={{ position: "relative" }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpen((prev) => !prev);
          }}
          disabled={loading}
          style={{
            background: "none",
            border: "none",
            cursor: loading ? "wait" : "pointer",
            padding: "4px",
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: loading ? 0.5 : 1,
          }}
          title="Agent actions"
        >
          {loading ? (
            <Loader2
              className="animate-spin"
              style={{ width: "18px", height: "18px", color: "var(--text-muted)" }}
            />
          ) : (
            <MoreVertical
              style={{ width: "18px", height: "18px", color: "var(--text-secondary)" }}
            />
          )}
        </button>

        {open && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: "4px",
              backgroundColor: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
              minWidth: "180px",
              zIndex: 100,
              overflow: "hidden",
            }}
          >
            {menuItems.map(({ action, label, icon: Icon, color }) => (
              <button
                key={action}
                onClick={(e) => {
                  e.stopPropagation();
                  handleMenuClick(action);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  width: "100%",
                  padding: "10px 14px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-primary)",
                  fontSize: "13px",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--surface-hover, rgba(255,255,255,0.05))";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <Icon style={{ width: "14px", height: "14px", color }} />
                {label}
              </button>
            ))}

            <div style={{ height: "1px", backgroundColor: "var(--border)", margin: "4px 0" }} />

            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMessageModal(true);
                setOpen(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "100%",
                padding: "10px 14px",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-primary)",
                fontSize: "13px",
                textAlign: "left",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--surface-hover, rgba(255,255,255,0.05))";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <MessageSquare style={{ width: "14px", height: "14px", color: "var(--accent)" }} />
              Send Message
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowModelModal(true);
                setOpen(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "100%",
                padding: "10px 14px",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-primary)",
                fontSize: "13px",
                textAlign: "left",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--surface-hover, rgba(255,255,255,0.05))";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <Cpu style={{ width: "14px", height: "14px", color: "var(--accent)" }} />
              Change Model
            </button>
          </div>
        )}

        {/* Inline error toast */}
        {error && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: "4px",
              backgroundColor: "var(--error, #ef4444)",
              color: "#fff",
              padding: "8px 12px",
              borderRadius: "6px",
              fontSize: "12px",
              maxWidth: "280px",
              zIndex: 101,
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Confirm dialog for stop/restart */}
      {confirmAction && (
        <ConfirmDialog
          title={`${confirmAction === "stop" ? "Stop" : "Restart"} Agent`}
          message={`This will ${confirmAction} the agent "${agentName}". Type the agent name to confirm.`}
          confirmLabel={confirmAction === "stop" ? "Stop Agent" : "Restart Agent"}
          destructive
          destructiveTarget={agentName}
          onConfirm={() => executeAction(confirmAction)}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {/* Message modal */}
      {showMessageModal && (
        <MessageModal
          agentId={agentId}
          agentName={agentName}
          onClose={() => setShowMessageModal(false)}
        />
      )}

      {/* Model swap modal */}
      {showModelModal && (
        <ModelSwapModal
          agentId={agentId}
          agentName={agentName}
          currentModel={currentModel}
          onClose={() => setShowModelModal(false)}
        />
      )}
    </>
  );
}
