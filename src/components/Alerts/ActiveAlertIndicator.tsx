"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { AlertHistoryEntry } from "@/lib/alerts/types";

const POLL_INTERVAL_MS = 15_000;

export function ActiveAlertIndicator() {
  const [criticalCount, setCriticalCount] = useState(0);
  const [warningCount, setWarningCount] = useState(0);
  const router = useRouter();

  const fetchActive = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts/active");
      if (!res.ok) return;
      const data = await res.json();
      const alerts: AlertHistoryEntry[] = data.alerts || [];
      setCriticalCount(alerts.filter((a) => a.severity === "critical").length);
      setWarningCount(alerts.filter((a) => a.severity === "warning").length);
    } catch {
      // Silently ignore — indicator just won't update
    }
  }, []);

  useEffect(() => {
    fetchActive();
    const interval = setInterval(fetchActive, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchActive]);

  if (criticalCount === 0 && warningCount === 0) {
    return null;
  }

  return (
    <button
      onClick={() => router.push("/alerts")}
      style={{
        position: "relative",
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "4px",
        display: "flex",
        alignItems: "center",
        gap: "4px",
      }}
      title={`${criticalCount} critical, ${warningCount} warning active alerts`}
    >
      {criticalCount > 0 && (
        <span
          className="flex items-center justify-center text-white animate-pulse"
          style={{
            backgroundColor: "#ef4444",
            fontSize: "9px",
            fontWeight: 700,
            minWidth: "18px",
            height: "18px",
            borderRadius: "9px",
            padding: "0 5px",
            lineHeight: 1,
          }}
        >
          {criticalCount > 99 ? "99+" : criticalCount}
        </span>
      )}
      {warningCount > 0 && (
        <span
          className="flex items-center justify-center"
          style={{
            backgroundColor: "#f59e0b",
            color: "#000",
            fontSize: "9px",
            fontWeight: 700,
            minWidth: "18px",
            height: "18px",
            borderRadius: "9px",
            padding: "0 5px",
            lineHeight: 1,
          }}
        >
          {warningCount > 99 ? "99+" : warningCount}
        </span>
      )}
    </button>
  );
}
