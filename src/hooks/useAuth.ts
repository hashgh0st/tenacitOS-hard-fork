"use client";

import { useState, useEffect, useCallback } from "react";

export interface AuthUser {
  userId: string;
  username: string;
  role: "admin" | "operator" | "viewer";
  totpEnabled: boolean;
}

export function useAuth(): {
  user: AuthUser | null;
  loading: boolean;
  logout: () => Promise<void>;
} {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchUser() {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          setUser(null);
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setUser({
            userId: data.userId,
            username: data.username,
            role: data.role,
            totpEnabled: data.totpEnabled,
          });
        }
      } catch {
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchUser();
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Proceed to redirect even if the request fails
    }
    setUser(null);
    window.location.href = "/login";
  }, []);

  return { user, loading, logout };
}
