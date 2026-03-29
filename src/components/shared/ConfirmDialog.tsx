"use client";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
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
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              background: "var(--error, #ef4444)",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
