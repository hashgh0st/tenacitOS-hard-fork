"use client";

import { useState, useEffect } from "react";
import { Search, Bell, User, Command, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { GlobalSearch } from "@/components/GlobalSearch";
import { NotificationDropdown } from "@/components/NotificationDropdown";
import { ActiveAlertIndicator } from "@/components/Alerts/ActiveAlertIndicator";

export function TopBar() {
  const [showSearch, setShowSearch] = useState(false);
  const [approvalCount, setApprovalCount] = useState(0);
  const router = useRouter();

  // Poll for pending approval count
  useEffect(() => {
    let cancelled = false;

    async function fetchCount() {
      try {
        const res = await fetch("/api/approvals/count");
        if (!res.ok) return;
        const data: { count: number } = await res.json();
        if (!cancelled) setApprovalCount(data.count);
      } catch {
        // Silently ignore — badge just won't update
      }
    }

    fetchCount();
    const interval = setInterval(fetchCount, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Command/Ctrl + K to open search
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch(true);
      }
      // Escape to close search
      if (e.key === "Escape" && showSearch) {
        setShowSearch(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showSearch]);

  return (
    <>
      <div
        className="top-bar"
        style={{
          position: "fixed",
          top: 0,
          left: "68px", // Width of dock
          right: 0,
          height: "48px",
          backgroundColor: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          zIndex: 45,
        }}
      >
        {/* Left: Logo & Title */}
        <div className="flex items-center gap-3">
          <span style={{ fontSize: "20px" }}>🦞</span>
          <h1
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "16px",
              fontWeight: 700,
              color: "var(--text-primary)",
              letterSpacing: "-0.5px",
            }}
          >
            TenacitOS
          </h1>
          {/* Version Badge */}
          <div
            style={{
              backgroundColor: "var(--accent-soft)",
              borderRadius: "4px",
              padding: "2px 8px",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "9px",
                fontWeight: 700,
                color: "var(--accent)",
                letterSpacing: "1px",
              }}
            >
              v1.0
            </span>
          </div>
        </div>

        {/* Right: Search + Notifications + User */}
        <div className="flex items-center gap-3">
          {/* Search Box */}
          <button
            onClick={() => setShowSearch(true)}
            className="flex items-center gap-2 transition-all"
            style={{
              width: "240px",
              height: "32px",
              backgroundColor: "var(--surface-elevated)",
              borderRadius: "6px",
              padding: "0 12px",
            }}
          >
            <Search
              className="flex-shrink-0"
              style={{
                width: "16px",
                height: "16px",
                color: "var(--text-muted)",
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "12px",
                color: "var(--text-muted)",
              }}
            >
              Search... ⌘K
            </span>
          </button>

          {/* Approval Badge */}
          <button
            onClick={() => router.push("/approvals")}
            style={{
              position: "relative",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Approvals"
          >
            <ShieldCheck
              style={{
                width: "18px",
                height: "18px",
                color: approvalCount > 0 ? "var(--warning, #f59e0b)" : "var(--text-muted)",
              }}
            />
            {approvalCount > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: "-2px",
                  right: "-4px",
                  backgroundColor: "var(--error, #ef4444)",
                  color: "#fff",
                  fontSize: "9px",
                  fontWeight: 700,
                  minWidth: "16px",
                  height: "16px",
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 4px",
                  lineHeight: 1,
                }}
              >
                {approvalCount > 99 ? "99+" : approvalCount}
              </span>
            )}
          </button>

          {/* Active Alert Indicator */}
          <ActiveAlertIndicator />

          {/* Notifications Dropdown */}
          <NotificationDropdown />

          {/* User Area */}
          <div className="flex items-center gap-2">
            {/* Avatar */}
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "14px",
                backgroundColor: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                }}
              >
                C
              </span>
            </div>
            {/* Name */}
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "12px",
                fontWeight: 500,
                color: "var(--text-secondary)",
              }}
            >
              Carlos
            </span>
          </div>
        </div>
      </div>

      {/* Global Search Modal */}
      {showSearch && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.8)",
          }}
          onClick={() => setShowSearch(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "90%",
              maxWidth: "42rem",
            }}
          >
            <GlobalSearch />
          </div>
        </div>
      )}
    </>
  );
}
