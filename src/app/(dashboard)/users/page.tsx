"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  Shield,
  ShieldCheck,
  UserPlus,
  Loader2,
  AlertCircle,
  CheckCircle,
  X,
  Copy,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { Role } from "@/lib/auth/roles";

interface UserRecord {
  id: string;
  username: string;
  role: Role;
  totpEnabled: boolean;
  createdAt: string;
  lastLogin: string | null;
  isActive: boolean;
}

export default function UsersPage() {
  const { user: currentUser, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Invite dialog state
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteRole, setInviteRole] = useState<Role>("viewer");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [copied, setCopied] = useState(false);

  // Action feedback
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/users");
      if (!res.ok) {
        if (res.status === 403) {
          setError("Access denied. Admin privileges required.");
        } else {
          setError("Failed to load users");
        }
        return;
      }
      const data = await res.json();
      setUsers(data.users);
    } catch {
      setError("Connection error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading) {
      fetchUsers();
    }
  }, [authLoading, fetchUsers]);

  const handleChangeRole = async (userId: string, newRole: Role) => {
    setActionLoading(userId);
    try {
      const res = await fetch("/api/auth/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed to change role");
        return;
      }
      await fetchUsers();
    } catch {
      setError("Connection error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleActive = async (userId: string, currentlyActive: boolean) => {
    setActionLoading(userId);
    try {
      const res = await fetch("/api/auth/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, isActive: !currentlyActive }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed to update user");
        return;
      }
      await fetchUsers();
    } catch {
      setError("Connection error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleInvite = async () => {
    setInviteLoading(true);
    setInviteError("");
    setInviteLink("");

    try {
      const res = await fetch("/api/auth/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: inviteRole }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setInviteError(data.error || "Failed to create invitation");
        setInviteLoading(false);
        return;
      }

      const link = `${window.location.origin}/register?token=${data.token}`;
      setInviteLink(link);
    } catch {
      setInviteError("Connection error");
    }

    setInviteLoading(false);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the text
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: "400px" }}>
        <Loader2
          className="w-8 h-8 animate-spin"
          style={{ color: "var(--accent)" }}
        />
      </div>
    );
  }

  if (currentUser?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center gap-4" style={{ minHeight: "400px" }}>
        <Shield className="w-12 h-12" style={{ color: "var(--error)" }} />
        <h2
          className="text-lg font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Access Denied
        </h2>
        <p style={{ color: "var(--text-secondary)" }} className="text-sm">
          Admin privileges are required to manage users.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6" style={{ color: "var(--accent)" }} />
          <h1
            className="text-xl font-bold"
            style={{
              fontFamily: "var(--font-heading)",
              color: "var(--text-primary)",
            }}
          >
            User Management
          </h1>
        </div>
        <button
          onClick={() => {
            setShowInviteDialog(true);
            setInviteLink("");
            setInviteError("");
            setCopied(false);
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            backgroundColor: "var(--accent)",
            color: "white",
          }}
        >
          <UserPlus className="w-4 h-4" />
          Invite User
        </button>
      </div>

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
          <button
            onClick={() => setError("")}
            className="ml-auto"
            style={{ color: "var(--error)" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Users table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          backgroundColor: "var(--card)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--border)",
                  backgroundColor: "var(--card-elevated)",
                }}
              >
                {["Username", "Role", "2FA", "Last Login", "Status", "Actions"].map(
                  (header) => (
                    <th
                      key={header}
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
              {users.map((u) => (
                <tr
                  key={u.id}
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-sm font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {u.username}
                      </span>
                      {u.id === currentUser?.userId && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: "var(--accent-soft)",
                            color: "var(--accent)",
                          }}
                        >
                          you
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      onChange={(e) =>
                        handleChangeRole(u.id, e.target.value as Role)
                      }
                      disabled={actionLoading === u.id || u.id === currentUser?.userId}
                      className="text-xs px-2 py-1 rounded"
                      style={{
                        backgroundColor: "var(--card-elevated)",
                        border: "1px solid var(--border)",
                        color: "var(--text-primary)",
                        cursor:
                          u.id === currentUser?.userId
                            ? "not-allowed"
                            : "pointer",
                        opacity: u.id === currentUser?.userId ? 0.5 : 1,
                      }}
                    >
                      <option value="admin">admin</option>
                      <option value="operator">operator</option>
                      <option value="viewer">viewer</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {u.totpEnabled ? (
                      <ShieldCheck
                        className="w-4 h-4"
                        style={{ color: "var(--success)" }}
                      />
                    ) : (
                      <span
                        className="text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Off
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="text-xs"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {u.lastLogin
                        ? new Date(u.lastLogin + "Z").toLocaleString()
                        : "Never"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: u.isActive
                          ? "var(--success)"
                          : "var(--error)",
                        color: "white",
                        opacity: 0.9,
                      }}
                    >
                      {u.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.id !== currentUser?.userId && (
                      <button
                        onClick={() => handleToggleActive(u.id, u.isActive)}
                        disabled={actionLoading === u.id}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors"
                        style={{
                          backgroundColor: "var(--card-elevated)",
                          border: "1px solid var(--border)",
                          color: "var(--text-secondary)",
                        }}
                        title={u.isActive ? "Deactivate user" : "Activate user"}
                      >
                        {actionLoading === u.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : u.isActive ? (
                          <ToggleRight className="w-3.5 h-3.5" />
                        ) : (
                          <ToggleLeft className="w-3.5 h-3.5" />
                        )}
                        {u.isActive ? "Deactivate" : "Activate"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center py-8 text-sm"
                    style={{ color: "var(--text-muted)" }}
                  >
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Dialog */}
      {showInviteDialog && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowInviteDialog(false);
          }}
        >
          <div
            className="rounded-xl p-6 w-full max-w-md"
            style={{
              backgroundColor: "var(--card)",
              border: "1px solid var(--border)",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2
                className="text-lg font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Invite New User
              </h2>
              <button
                onClick={() => setShowInviteDialog(false)}
                style={{ color: "var(--text-muted)" }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!inviteLink ? (
              <div className="space-y-4">
                <div>
                  <label
                    className="block text-sm font-medium mb-1.5"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Role
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as Role)}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{
                      backgroundColor: "var(--card-elevated)",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <option value="viewer">Viewer - Read-only access</option>
                    <option value="operator">Operator - Can execute actions</option>
                    <option value="admin">Admin - Full access</option>
                  </select>
                </div>

                {inviteError && (
                  <div
                    className="flex items-center gap-2 text-sm px-4 py-3 rounded-lg"
                    style={{
                      backgroundColor: "var(--error-bg)",
                      color: "var(--error)",
                    }}
                  >
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {inviteError}
                  </div>
                )}

                <button
                  onClick={handleInvite}
                  disabled={inviteLoading}
                  className="w-full font-semibold py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{
                    backgroundColor: "var(--accent)",
                    color: "white",
                  }}
                >
                  {inviteLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      Generate Invite Link
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div
                  className="flex items-center gap-2 text-sm px-4 py-3 rounded-lg"
                  style={{
                    backgroundColor: "var(--success)",
                    color: "white",
                    opacity: 0.9,
                  }}
                >
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  Invitation link generated!
                </div>

                <div
                  className="relative p-3 rounded-lg text-xs break-all"
                  style={{
                    backgroundColor: "var(--card-elevated)",
                    border: "1px solid var(--border)",
                    color: "var(--text-secondary)",
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  {inviteLink}
                </div>

                <button
                  onClick={handleCopyLink}
                  className="w-full font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                  style={{
                    backgroundColor: copied ? "var(--success)" : "var(--card-elevated)",
                    border: "1px solid var(--border)",
                    color: copied ? "white" : "var(--text-primary)",
                  }}
                >
                  {copied ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy Link
                    </>
                  )}
                </button>

                <p
                  className="text-xs text-center"
                  style={{ color: "var(--text-muted)" }}
                >
                  This link expires in 7 days and can only be used once.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
