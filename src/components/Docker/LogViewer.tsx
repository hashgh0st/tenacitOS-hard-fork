"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X, Terminal, Loader2 } from "lucide-react";

interface LogViewerProps {
  containerId: string;
  containerName: string;
  onClose: () => void;
}

const MAX_LINES = 500;

type ConnectionState = "connecting" | "connected" | "disconnected";

export function LogViewer({
  containerId,
  containerName,
  onClose,
}: LogViewerProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [connState, setConnState] = useState<ConnectionState>("connecting");
  const bottomRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  const addLines = useCallback((newLines: string[]) => {
    setLines((prev) => {
      const combined = [...prev, ...newLines];
      if (combined.length > MAX_LINES) {
        return combined.slice(combined.length - MAX_LINES);
      }
      return combined;
    });
  }, []);

  useEffect(() => {
    const es = new EventSource(`/api/docker/${containerId}/logs`);
    esRef.current = es;

    es.addEventListener("connected", () => {
      setConnState("connected");
    });

    es.onmessage = (event: MessageEvent) => {
      try {
        const text = JSON.parse(event.data) as string;
        addLines([text]);
      } catch {
        // Ignore parse errors
      }
    };

    es.addEventListener("end", () => {
      setConnState("disconnected");
      es.close();
    });

    es.addEventListener("error", () => {
      setConnState("disconnected");
      es.close();
    });

    es.onerror = () => {
      setConnState("disconnected");
      es.close();
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [containerId, addLines]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

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
          maxWidth: "900px",
          height: "80vh",
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
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <Terminal className="w-4 h-4" style={{ color: "var(--accent)" }} />
          <span
            style={{
              color: "#c9d1d9",
              fontFamily: "monospace",
              fontSize: "0.9rem",
            }}
          >
            {containerName} logs
          </span>

          {/* Connection status */}
          <span
            className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs"
            style={{
              marginLeft: "0.5rem",
              color:
                connState === "connected"
                  ? "var(--success)"
                  : connState === "connecting"
                    ? "var(--warning)"
                    : "var(--error)",
              backgroundColor:
                connState === "connected"
                  ? "rgba(34,197,94,0.12)"
                  : connState === "connecting"
                    ? "rgba(234,179,8,0.12)"
                    : "rgba(239,68,68,0.12)",
            }}
          >
            {connState === "connecting" && (
              <Loader2
                className="w-3 h-3 animate-spin"
                style={{ flexShrink: 0 }}
              />
            )}
            {connState === "connected"
              ? "Live"
              : connState === "connecting"
                ? "Connecting..."
                : "Disconnected"}
          </span>

          <button
            onClick={onClose}
            style={{
              marginLeft: "auto",
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

        {/* Log content */}
        <div style={{ flex: 1, overflow: "auto", padding: "1rem" }}>
          {connState === "connecting" && lines.length === 0 ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
              }}
            >
              <Loader2
                className="w-8 h-8 animate-spin"
                style={{ color: "var(--accent)" }}
              />
            </div>
          ) : (
            <pre
              style={{
                fontFamily: "monospace",
                fontSize: "0.8rem",
                color: "#c9d1d9",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              {lines.length === 0 ? "No log output" : lines.join("\n")}
              <div ref={bottomRef} />
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
