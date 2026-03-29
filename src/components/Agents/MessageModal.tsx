"use client";

import { useState, useEffect, useRef } from "react";
import { Send, X, Loader2, CheckCircle } from "lucide-react";

interface MessageModalProps {
  agentId: string;
  agentName: string;
  onClose: () => void;
}

export function MessageModal({ agentId, agentName, onClose }: MessageModalProps) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleSend = async () => {
    if (!message.trim() || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/agents/${agentId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 503) {
          throw new Error(
            "Agent gateway is unavailable. The gateway service may be down.",
          );
        }
        throw new Error(data.error || `Failed to send message (${res.status})`);
      }

      setSuccess(true);
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        backgroundColor: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--card)",
          borderRadius: "1rem",
          padding: "2rem",
          maxWidth: "480px",
          width: "100%",
          border: "1px solid var(--border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between"
          style={{ marginBottom: "1.25rem" }}
        >
          <h3
            style={{
              color: "var(--text-primary)",
              fontWeight: 600,
              fontSize: "1.1rem",
            }}
          >
            Send Message to {agentName}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
            }}
          >
            <X style={{ width: "18px", height: "18px", color: "var(--text-muted)" }} />
          </button>
        </div>

        {/* Success state */}
        {success ? (
          <div
            className="flex items-center gap-2 justify-center"
            style={{
              padding: "2rem",
              color: "var(--success, #4ade80)",
            }}
          >
            <CheckCircle style={{ width: "20px", height: "20px" }} />
            <span style={{ fontWeight: 500 }}>Message sent</span>
          </div>
        ) : (
          <>
            {/* Textarea */}
            <textarea
              ref={inputRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
              rows={4}
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  handleSend();
                }
              }}
              style={{
                width: "100%",
                padding: "0.75rem",
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
                backgroundColor: "var(--card-elevated, var(--surface))",
                color: "var(--text-primary)",
                fontSize: "0.9rem",
                resize: "vertical",
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "inherit",
                opacity: loading ? 0.6 : 1,
              }}
            />

            {/* Error */}
            {error && (
              <p
                style={{
                  color: "var(--error, #ef4444)",
                  fontSize: "0.85rem",
                  marginTop: "0.75rem",
                }}
              >
                {error}
              </p>
            )}

            {/* Actions */}
            <div
              className="flex items-center justify-between"
              style={{ marginTop: "1rem" }}
            >
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                }}
              >
                Ctrl+Enter to send
              </span>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  disabled={loading}
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: "0.5rem",
                    background: "var(--card-elevated, var(--surface))",
                    color: "var(--text-secondary)",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "0.9rem",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSend}
                  disabled={loading || !message.trim()}
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: "0.5rem",
                    background:
                      !loading && message.trim()
                        ? "var(--accent)"
                        : "var(--card-elevated, var(--surface))",
                    color:
                      !loading && message.trim()
                        ? "#fff"
                        : "var(--text-muted)",
                    border: "none",
                    cursor:
                      !loading && message.trim() ? "pointer" : "not-allowed",
                    fontWeight: 600,
                    fontSize: "0.9rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    opacity: !loading && message.trim() ? 1 : 0.6,
                  }}
                >
                  {loading ? (
                    <Loader2
                      className="animate-spin"
                      style={{ width: "14px", height: "14px" }}
                    />
                  ) : (
                    <Send style={{ width: "14px", height: "14px" }} />
                  )}
                  Send
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
