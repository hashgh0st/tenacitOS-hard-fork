"use client";

import { useEffect, useRef, useState } from "react";
import { X, Terminal, Loader2 } from "lucide-react";

interface ActionOutputProps {
  actionName: string;
  output: string;
  status: "success" | "error" | "streaming";
  durationMs?: number;
  timestamp?: string;
  executionId?: string;
  onClose: () => void;
}

export function ActionOutput({
  actionName,
  output: initialOutput,
  status: initialStatus,
  durationMs,
  timestamp,
  executionId,
  onClose,
}: ActionOutputProps) {
  const [output, setOutput] = useState(initialOutput);
  const [status, setStatus] = useState(initialStatus);
  const outputRef = useRef<HTMLDivElement>(null);

  // Subscribe to SSE for streaming actions
  useEffect(() => {
    if (!executionId || initialStatus !== "streaming") return;

    const eventSource = new EventSource(`/api/actions/${executionId}/stream`);

    eventSource.addEventListener("output", (event) => {
      const chunk = JSON.parse(event.data) as string;
      setOutput((prev) => prev + chunk);
    });

    eventSource.addEventListener("complete", (event) => {
      const data = JSON.parse(event.data) as {
        status: string;
        exitCode?: number;
        output?: string;
      };
      setStatus(data.status === "success" ? "success" : "error");
      if (data.output) {
        setOutput((prev) => prev + "\n" + data.output);
      }
      eventSource.close();
    });

    eventSource.addEventListener("error", () => {
      setStatus("error");
      eventSource.close();
    });

    return () => {
      eventSource.close();
    };
  }, [executionId, initialStatus]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const statusColor =
    status === "success"
      ? "var(--success)"
      : status === "error"
        ? "var(--error)"
        : "#60A5FA";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        backgroundColor: "rgba(0,0,0,0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        style={{
          width: "95vw",
          maxWidth: "800px",
          height: "75vh",
          backgroundColor: "#0d1117",
          borderRadius: "1rem",
          border: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: "0.875rem 1rem",
            borderBottom: "1px solid #30363d",
            flexShrink: 0,
          }}
        >
          {status === "streaming" ? (
            <Loader2
              className="w-4 h-4 animate-spin"
              style={{ color: statusColor }}
            />
          ) : (
            <Terminal className="w-4 h-4" style={{ color: statusColor }} />
          )}
          <span
            style={{
              color: "#c9d1d9",
              fontFamily: "monospace",
              fontSize: "0.9rem",
              flex: 1,
            }}
          >
            {actionName}
          </span>
          {durationMs != null && (
            <span style={{ fontSize: "0.75rem", color: "#8b949e" }}>
              {durationMs}ms
            </span>
          )}
          {timestamp && (
            <span style={{ fontSize: "0.75rem", color: "#8b949e" }}>
              {new Date(timestamp).toLocaleTimeString()}
            </span>
          )}
          <span
            style={{
              fontSize: "0.7rem",
              padding: "0.125rem 0.5rem",
              borderRadius: "0.25rem",
              backgroundColor:
                status === "success"
                  ? "rgba(34,197,94,0.15)"
                  : status === "error"
                    ? "rgba(239,68,68,0.15)"
                    : "rgba(96,165,250,0.15)",
              color: statusColor,
              fontWeight: 600,
            }}
          >
            {status === "streaming" ? "RUNNING" : status.toUpperCase()}
          </span>
          <button
            onClick={onClose}
            style={{
              padding: "0.375rem",
              borderRadius: "0.375rem",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#8b949e",
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Output */}
        <div ref={outputRef} style={{ flex: 1, overflow: "auto", padding: "1rem" }}>
          <pre
            style={{
              fontFamily: "monospace",
              fontSize: "0.8rem",
              color: "#c9d1d9",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              lineHeight: 1.6,
            }}
          >
            {output || (status === "streaming" ? "Waiting for output..." : "(no output)")}
          </pre>
        </div>
      </div>
    </div>
  );
}
