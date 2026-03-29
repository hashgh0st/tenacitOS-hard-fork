"use client";

import { useState, useEffect } from "react";
import { X, Loader2, CheckCircle, Cpu } from "lucide-react";

const AVAILABLE_MODELS = [
  "claude-sonnet-4-20250514",
  "claude-opus-4-20250514",
  "claude-haiku-4-5-20251001",
];

interface ModelSwapModalProps {
  agentId: string;
  agentName: string;
  currentModel?: string;
  onClose: () => void;
}

export function ModelSwapModal({
  agentId,
  agentName,
  currentModel,
  onClose,
}: ModelSwapModalProps) {
  const [selectedModel, setSelectedModel] = useState(
    currentModel && AVAILABLE_MODELS.includes(currentModel)
      ? currentModel
      : AVAILABLE_MODELS[0],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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

  const handleSwap = async () => {
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/agents/${agentId}/model`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: selectedModel }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 503) {
          throw new Error(
            "Agent gateway is unavailable. The gateway service may be down.",
          );
        }
        throw new Error(data.error || `Failed to swap model (${res.status})`);
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

  const isChanged = selectedModel !== currentModel;

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
          maxWidth: "420px",
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
            Change Model — {agentName}
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
            <span style={{ fontWeight: 500 }}>Model updated</span>
          </div>
        ) : (
          <>
            {/* Current model */}
            {currentModel && (
              <div style={{ marginBottom: "1rem" }}>
                <label
                  style={{
                    display: "block",
                    color: "var(--text-muted)",
                    fontSize: "0.8rem",
                    marginBottom: "0.25rem",
                  }}
                >
                  Current model
                </label>
                <div
                  style={{
                    color: "var(--text-secondary)",
                    fontSize: "0.9rem",
                    fontFamily: "monospace",
                  }}
                >
                  {currentModel}
                </div>
              </div>
            )}

            {/* Model selector */}
            <div style={{ marginBottom: "1.25rem" }}>
              <label
                style={{
                  display: "block",
                  color: "var(--text-secondary)",
                  fontSize: "0.85rem",
                  marginBottom: "0.5rem",
                }}
              >
                Select new model
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "0.6rem 0.75rem",
                  borderRadius: "0.5rem",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--card-elevated, var(--surface))",
                  color: "var(--text-primary)",
                  fontSize: "0.9rem",
                  outline: "none",
                  boxSizing: "border-box",
                  cursor: "pointer",
                  fontFamily: "monospace",
                }}
              >
                {AVAILABLE_MODELS.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>

            {/* Error */}
            {error && (
              <p
                style={{
                  color: "var(--error, #ef4444)",
                  fontSize: "0.85rem",
                  marginBottom: "0.75rem",
                }}
              >
                {error}
              </p>
            )}

            {/* Actions */}
            <div
              className="flex justify-end gap-2"
              style={{ marginTop: "0.5rem" }}
            >
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
                onClick={handleSwap}
                disabled={loading || !isChanged}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "0.5rem",
                  background:
                    !loading && isChanged
                      ? "var(--accent)"
                      : "var(--card-elevated, var(--surface))",
                  color:
                    !loading && isChanged ? "#fff" : "var(--text-muted)",
                  border: "none",
                  cursor:
                    !loading && isChanged ? "pointer" : "not-allowed",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  opacity: !loading && isChanged ? 1 : 0.6,
                }}
              >
                {loading ? (
                  <Loader2
                    className="animate-spin"
                    style={{ width: "14px", height: "14px" }}
                  />
                ) : (
                  <Cpu style={{ width: "14px", height: "14px" }} />
                )}
                Confirm
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
