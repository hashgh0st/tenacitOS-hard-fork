"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Terminal, Lock, User, AlertCircle, ShieldCheck, Loader2 } from "lucide-react";

type LoginStep = "credentials" | "totp";

function LoginForm() {
  const [step, setStep] = useState<LoginStep>("credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (res.status === 429) {
          setError("Too many failed attempts. Please try again later.");
        } else {
          setError(data.error || "Invalid username or password");
        }
        setLoading(false);
        return;
      }

      if (data.requiresTOTP) {
        setSessionToken(data.sessionToken);
        setStep("totp");
        setLoading(false);
        return;
      }

      // Success - redirect
      const from = searchParams.get("from") || "/";
      router.push(from);
      router.refresh();
    } catch {
      setError("Connection error");
    }

    setLoading(false);
  };

  const handleTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/totp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: sessionToken, code: totpCode }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Invalid TOTP code");
        setLoading(false);
        return;
      }

      // Success - redirect
      const from = searchParams.get("from") || "/";
      router.push(from);
      router.refresh();
    } catch {
      setError("Connection error");
    }

    setLoading(false);
  };

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
            Mission Control
          </h1>
        </div>
        <p
          className="text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          {step === "credentials"
            ? "Sign in to access your dashboard"
            : "Enter the 6-digit code from your authenticator app"}
        </p>
      </div>

      {/* Credentials Step */}
      {step === "credentials" && (
        <form onSubmit={handleCredentialsSubmit} className="space-y-4">
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
              placeholder="Username"
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
              placeholder="Password"
              autoComplete="current-password"
              required
            />
          </div>

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
                Verifying...
              </>
            ) : (
              "Sign In"
            )}
          </button>
        </form>
      )}

      {/* TOTP Step */}
      {step === "totp" && (
        <form onSubmit={handleTotpSubmit} className="space-y-4">
          <div className="relative">
            <ShieldCheck
              className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px]"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              type="text"
              value={totpCode}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                setTotpCode(val);
              }}
              className="w-full pl-11 pr-4 py-3 rounded-lg text-sm tracking-widest"
              style={{
                backgroundColor: "var(--card-elevated)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono, monospace)",
              }}
              placeholder="000000"
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              required
            />
          </div>

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
            disabled={loading || totpCode.length !== 6}
            className="w-full font-semibold py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            style={{
              backgroundColor: "var(--accent)",
              color: "white",
            }}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Verifying...
              </>
            ) : (
              "Verify Code"
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setStep("credentials");
              setTotpCode("");
              setSessionToken("");
              setError("");
            }}
            className="w-full py-2 text-sm transition-colors"
            style={{ color: "var(--text-muted)" }}
          >
            Back to login
          </button>
        </form>
      )}

      {/* Footer */}
      <p
        className="text-center text-xs mt-6"
        style={{ color: "var(--text-muted)" }}
      >
        Tenacitas Agent Dashboard
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 -ml-64"
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
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
