"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Terminal,
  User,
  Lock,
  AlertCircle,
  CheckCircle,
  Loader2,
  Shield,
} from "lucide-react";

function RegisterForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [validatingToken, setValidatingToken] = useState(true);
  const [tokenError, setTokenError] = useState("");
  const [inviteRole, setInviteRole] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  useEffect(() => {
    if (!token) {
      setTokenError("No invitation token provided. You need an invitation link to register.");
      setValidatingToken(false);
      return;
    }

    // Validate the token by checking it against the server
    async function validateToken() {
      try {
        const res = await fetch("/api/auth/invite/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (!res.ok || !data.valid) {
          setTokenError(data.error || "Invalid or expired invitation token.");
        } else {
          setInviteRole(data.role);
        }
      } catch {
        setTokenError("Failed to validate invitation token.");
      } finally {
        setValidatingToken(false);
      }
    }

    validateToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 16) {
      setError("Password must be at least 16 characters");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, username, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Registration failed");
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch {
      setError("Connection error");
    }

    setLoading(false);
  };

  // Loading state while validating token
  if (validatingToken) {
    return (
      <div
        className="rounded-xl p-10"
        style={{
          backgroundColor: "var(--card)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="flex flex-col items-center gap-4">
          <Loader2
            className="w-8 h-8 animate-spin"
            style={{ color: "var(--accent)" }}
          />
          <p style={{ color: "var(--text-secondary)" }} className="text-sm">
            Validating invitation...
          </p>
        </div>
      </div>
    );
  }

  // Token error
  if (tokenError) {
    return (
      <div
        className="rounded-xl p-10"
        style={{
          backgroundColor: "var(--card)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertCircle
            className="w-10 h-10"
            style={{ color: "var(--error)" }}
          />
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Invalid Invitation
          </h2>
          <p style={{ color: "var(--text-secondary)" }} className="text-sm">
            {tokenError}
          </p>
          <button
            onClick={() => router.push("/login")}
            className="mt-2 py-2 px-4 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: "var(--card-elevated)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div
        className="rounded-xl p-10"
        style={{
          backgroundColor: "var(--card)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <CheckCircle
            className="w-10 h-10"
            style={{ color: "var(--success)" }}
          />
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Account Created
          </h2>
          <p style={{ color: "var(--text-secondary)" }} className="text-sm">
            Redirecting to login...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl p-10"
      style={{
        backgroundColor: "var(--card)",
        border: "1px solid var(--border)",
      }}
    >
      {/* Header */}
      <div className="text-center mb-6 flex flex-col items-center gap-2">
        <div className="flex items-center gap-2.5">
          <Terminal
            className="w-7 h-7"
            style={{ color: "var(--accent)" }}
          />
          <span className="text-2xl">🦞</span>
          <h1
            className="text-xl font-bold"
            style={{
              fontFamily: "var(--font-heading)",
              color: "var(--text-primary)",
              letterSpacing: "-0.5px",
            }}
          >
            Create Account
          </h1>
        </div>
        <p
          className="text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          Set up your credentials to get started
        </p>
        {inviteRole && (
          <div
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full mt-1"
            style={{
              backgroundColor: "var(--accent-soft)",
              color: "var(--accent)",
            }}
          >
            <Shield className="w-3 h-3" />
            Role: {inviteRole}
          </div>
        )}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <User
            className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px]"
            style={{ color: "var(--text-muted)" }}
          />
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full pl-11 pr-4 py-3 rounded-lg text-sm"
            style={{
              backgroundColor: "var(--card-elevated)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
            placeholder="Username (3-32 chars, alphanumeric)"
            autoComplete="username"
            required
          />
        </div>

        <div className="relative">
          <Lock
            className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px]"
            style={{ color: "var(--text-muted)" }}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full pl-11 pr-4 py-3 rounded-lg text-sm"
            style={{
              backgroundColor: "var(--card-elevated)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
            placeholder="Password (16+ characters)"
            autoComplete="new-password"
            minLength={16}
            required
          />
        </div>

        <div className="relative">
          <Lock
            className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px]"
            style={{ color: "var(--text-muted)" }}
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full pl-11 pr-4 py-3 rounded-lg text-sm"
            style={{
              backgroundColor: "var(--card-elevated)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
            placeholder="Confirm password"
            autoComplete="new-password"
            minLength={16}
            required
          />
        </div>

        {password.length > 0 && password.length < 16 && (
          <p className="text-xs" style={{ color: "var(--warning)" }}>
            Password needs at least {16 - password.length} more character{16 - password.length !== 1 ? "s" : ""}
          </p>
        )}

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

        <button
          type="submit"
          disabled={loading}
          className="w-full font-semibold py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          style={{
            backgroundColor: "var(--accent)",
            color: "white",
          }}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Creating account...
            </>
          ) : (
            "Create Account"
          )}
        </button>
      </form>

      {/* Footer */}
      <p
        className="text-center text-xs mt-6"
        style={{ color: "var(--text-muted)" }}
      >
        Already have an account?{" "}
        <a
          href="/login"
          className="underline"
          style={{ color: "var(--accent)" }}
        >
          Sign in
        </a>
      </p>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: "var(--background)" }}
    >
      <div className="w-full max-w-md">
        <Suspense
          fallback={
            <div
              className="rounded-xl p-10 animate-pulse"
              style={{
                backgroundColor: "var(--card)",
                border: "1px solid var(--border)",
              }}
            >
              <div className="h-8 bg-gray-700 rounded mb-4" />
              <div className="h-12 bg-gray-700 rounded mb-4" />
              <div className="h-10 bg-gray-700 rounded" />
            </div>
          }
        >
          <RegisterForm />
        </Suspense>
      </div>
    </div>
  );
}
