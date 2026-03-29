"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import {
  FileText,
  Shield,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Filter,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface AuditEntry {
  id: number;
  timestamp: string;
  userId: string | null;
  username: string;
  action: string;
  target: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  severity: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const SEVERITY_COLORS: Record<string, string> = {
  info: "var(--accent)",
  warning: "var(--warning)",
  critical: "var(--error)",
};

export default function AuditPage() {
  const { user: currentUser, loading: authLoading } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [filterAction, setFilterAction] = useState("");
  const [filterUsername, setFilterUsername] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const fetchAuditLog = useCallback(
    async (page: number = 1) => {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", "50");
        if (filterAction) params.set("action", filterAction);
        if (filterUsername) params.set("username", filterUsername);
        if (filterSeverity) params.set("severity", filterSeverity);
        if (filterFrom) params.set("from", filterFrom);
        if (filterTo) params.set("to", filterTo);

        const res = await fetch(`/api/auth/audit?${params.toString()}`);
        if (!res.ok) {
          if (res.status === 403) {
            setError("Access denied. Admin privileges required.");
          } else {
            setError("Failed to load audit log");
          }
          setLoading(false);
          return;
        }

        const data = await res.json();
        setEntries(data.entries);
        setPagination(data.pagination);
      } catch {
        setError("Connection error");
      } finally {
        setLoading(false);
      }
    },
    [filterAction, filterUsername, filterSeverity, filterFrom, filterTo],
  );

  useEffect(() => {
    if (!authLoading) {
      fetchAuditLog(1);
    }
  }, [authLoading, fetchAuditLog]);

  const toggleRow = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const clearFilters = () => {
    setFilterAction("");
    setFilterUsername("");
    setFilterSeverity("");
    setFilterFrom("");
    setFilterTo("");
  };

  const hasActiveFilters =
    filterAction || filterUsername || filterSeverity || filterFrom || filterTo;

  if (authLoading) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ minHeight: "400px" }}
      >
        <Loader2
          className="w-8 h-8 animate-spin"
          style={{ color: "var(--accent)" }}
        />
      </div>
    );
  }

  if (currentUser?.role !== "admin") {
    return (
      <div
        className="flex flex-col items-center justify-center gap-4"
        style={{ minHeight: "400px" }}
      >
        <Shield className="w-12 h-12" style={{ color: "var(--error)" }} />
        <h2
          className="text-lg font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Access Denied
        </h2>
        <p style={{ color: "var(--text-secondary)" }} className="text-sm">
          Admin privileges are required to view the audit log.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6" style={{ color: "var(--accent)" }} />
          <h1
            className="text-xl font-bold"
            style={{
              fontFamily: "var(--font-heading)",
              color: "var(--text-primary)",
            }}
          >
            Audit Log
          </h1>
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: "var(--card-elevated)",
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
            }}
          >
            {pagination.total} entries
          </span>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
          style={{
            backgroundColor: hasActiveFilters
              ? "var(--accent-soft)"
              : "var(--card-elevated)",
            border: "1px solid var(--border)",
            color: hasActiveFilters
              ? "var(--accent)"
              : "var(--text-secondary)",
          }}
        >
          <Filter className="w-4 h-4" />
          Filters
          {hasActiveFilters && (
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: "var(--accent)" }}
            />
          )}
        </button>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div
          className="rounded-xl p-4"
          style={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Action
              </label>
              <input
                type="text"
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg text-sm"
                style={{
                  backgroundColor: "var(--card-elevated)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
                placeholder="e.g. login.success"
              />
            </div>
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Username
              </label>
              <input
                type="text"
                value={filterUsername}
                onChange={(e) => setFilterUsername(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg text-sm"
                style={{
                  backgroundColor: "var(--card-elevated)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
                placeholder="e.g. admin"
              />
            </div>
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Severity
              </label>
              <select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg text-sm"
                style={{
                  backgroundColor: "var(--card-elevated)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
              >
                <option value="">All</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                From
              </label>
              <input
                type="datetime-local"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg text-sm"
                style={{
                  backgroundColor: "var(--card-elevated)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
              />
            </div>
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                To
              </label>
              <input
                type="datetime-local"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg text-sm"
                style={{
                  backgroundColor: "var(--card-elevated)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => fetchAuditLog(1)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{
                backgroundColor: "var(--accent)",
                color: "white",
              }}
            >
              Apply
            </button>
            {hasActiveFilters && (
              <button
                onClick={() => {
                  clearFilters();
                  // fetchAuditLog will re-run due to dependency change
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm"
                style={{
                  backgroundColor: "var(--card-elevated)",
                  border: "1px solid var(--border)",
                  color: "var(--text-muted)",
                }}
              >
                <X className="w-3 h-3" />
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div
          className="flex items-center gap-2 text-sm px-4 py-3 rounded-lg"
          style={{
            backgroundColor: "var(--error-bg)",
            color: "var(--error)",
          }}
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Audit table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          backgroundColor: "var(--card)",
          border: "1px solid var(--border)",
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2
              className="w-6 h-6 animate-spin"
              style={{ color: "var(--accent)" }}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--border)",
                    backgroundColor: "var(--card-elevated)",
                  }}
                >
                  {["", "Timestamp", "User", "Action", "Target", "Severity", "IP"].map(
                    (header) => (
                      <th
                        key={header || "expand"}
                        className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {header}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <Fragment key={entry.id}>
                    <tr
                      style={{
                        borderBottom: expandedRows.has(entry.id)
                          ? "none"
                          : "1px solid var(--border)",
                        cursor: entry.details ? "pointer" : "default",
                      }}
                      onClick={() => {
                        if (entry.details) toggleRow(entry.id);
                      }}
                    >
                      <td className="px-4 py-3 w-8">
                        {entry.details && (
                          expandedRows.has(entry.id) ? (
                            <ChevronDown
                              className="w-4 h-4"
                              style={{ color: "var(--text-muted)" }}
                            />
                          ) : (
                            <ChevronRight
                              className="w-4 h-4"
                              style={{ color: "var(--text-muted)" }}
                            />
                          )
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="text-xs"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {new Date(entry.timestamp + "Z").toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="text-sm"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {entry.username}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="text-xs px-2 py-0.5 rounded"
                          style={{
                            backgroundColor: "var(--card-elevated)",
                            color: "var(--text-secondary)",
                            fontFamily: "var(--font-mono, monospace)",
                          }}
                        >
                          {entry.action}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="text-xs"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {entry.target || "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="text-xs font-medium"
                          style={{
                            color:
                              SEVERITY_COLORS[entry.severity] ||
                              "var(--text-muted)",
                          }}
                        >
                          {entry.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="text-xs"
                          style={{
                            color: "var(--text-muted)",
                            fontFamily: "var(--font-mono, monospace)",
                          }}
                        >
                          {entry.ipAddress || "-"}
                        </span>
                      </td>
                    </tr>
                    {expandedRows.has(entry.id) && entry.details && (
                      <tr
                        key={`${entry.id}-details`}
                        style={{ borderBottom: "1px solid var(--border)" }}
                      >
                        <td colSpan={7} className="px-4 py-3">
                          <pre
                            className="text-xs p-3 rounded-lg overflow-x-auto"
                            style={{
                              backgroundColor: "var(--card-elevated)",
                              border: "1px solid var(--border)",
                              color: "var(--text-secondary)",
                              fontFamily: "var(--font-mono, monospace)",
                            }}
                          >
                            {JSON.stringify(entry.details, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {entries.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="text-center py-12 text-sm"
                      style={{ color: "var(--text-muted)" }}
                    >
                      No audit entries found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span
            className="text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchAuditLog(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm disabled:opacity-30"
              style={{
                backgroundColor: "var(--card-elevated)",
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
              }}
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            <button
              onClick={() => fetchAuditLog(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm disabled:opacity-30"
              style={{
                backgroundColor: "var(--card-elevated)",
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
              }}
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
