"use client";

import { useState } from "react";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** When true, requires typing destructiveTarget to enable confirm. */
  destructive?: boolean;
  /** The string the user must type to confirm a destructive action. */
  destructiveTarget?: string;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  destructive = false,
  destructiveTarget = "",
}: ConfirmDialogProps) {
  const [typedValue, setTypedValue] = useState("");
  const confirmEnabled = !destructive || typedValue === destructiveTarget;

  return (
    <div
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
        style={{
          backgroundColor: "var(--card)",
          borderRadius: "1rem",
          padding: "2rem",
          maxWidth: "400px",
          width: "100%",
          border: "1px solid var(--border)",
        }}
      >
        <h3
          style={{
            color: "var(--text-primary)",
            marginBottom: "0.75rem",
            fontWeight: 600,
          }}
        >
          {title}
        </h3>
        <p
          style={{
            color: "var(--text-secondary)",
            marginBottom: "1.5rem",
            fontSize: "0.9rem",
          }}
        >
          {message}
        </p>

        {destructive && destructiveTarget && (
          <div style={{ marginBottom: "1.5rem" }}>
            <label
              style={{
                display: "block",
                color: "var(--text-secondary)",
                fontSize: "0.85rem",
                marginBottom: "0.5rem",
              }}
            >
              Type{" "}
              <strong style={{ color: "var(--text-primary)" }}>
                {destructiveTarget}
              </strong>{" "}
              to confirm
            </label>
            <input
              type="text"
              value={typedValue}
              onChange={(e) => setTypedValue(e.target.value)}
              placeholder={destructiveTarget}
              style={{
                width: "100%",
                padding: "0.5rem 0.75rem",
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
                backgroundColor: "var(--card-elevated)",
                color: "var(--text-primary)",
                fontSize: "0.9rem",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onCancel}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              background: "var(--card-elevated)",
              color: "var(--text-secondary)",
              border: "none",
              cursor: "pointer",
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={!confirmEnabled}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              background: confirmEnabled
                ? "var(--error, #ef4444)"
                : "var(--card-elevated)",
              color: confirmEnabled ? "#fff" : "var(--text-muted)",
              border: "none",
              cursor: confirmEnabled ? "pointer" : "not-allowed",
              fontWeight: 600,
              opacity: confirmEnabled ? 1 : 0.6,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
