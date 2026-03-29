"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Container,
  Image,
  Server,
  AlertTriangle,
  Settings2,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useDockerStatus } from "@/components/shared/SSEProvider";
import { ContainerCard } from "@/components/Docker/ContainerCard";
import { ImageList } from "@/components/Docker/ImageList";
import { SystemInfo } from "@/components/Docker/SystemInfo";
import { LogViewer } from "@/components/Docker/LogViewer";
import type {
  DockerContainer,
  DockerImage as DockerImageType,
  DockerSystemInfo,
  DockerDiskUsage,
  DockerState,
} from "@/lib/docker/types";

type Tab = "containers" | "images" | "system";

interface DockerData {
  state: DockerState;
  containers?: DockerContainer[];
  images?: DockerImageType[];
  systemInfo?: DockerSystemInfo;
  diskUsage?: DockerDiskUsage;
}

interface LogTarget {
  id: string;
  name: string;
}

export default function DockerPage() {
  const { user, loading: authLoading } = useAuth();
  const { data: dockerSSE } = useDockerStatus();
  const [data, setData] = useState<DockerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("containers");
  const [logTarget, setLogTarget] = useState<LogTarget | null>(null);

  const canAct =
    user?.role === "admin" || user?.role === "operator";

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/docker");
      if (res.ok) {
        const json = (await res.json()) as DockerData;
        setData(json);
      }
    } catch (err) {
      console.error("Failed to fetch Docker data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Merge real-time SSE updates into container state
  useEffect(() => {
    if (!dockerSSE || !data || data.state !== "available" || !data.containers)
      return;

    setData((prev) => {
      if (!prev || !prev.containers) return prev;
      const updated = prev.containers.map((c) => {
        const match = dockerSSE.containers.find((s) => s.id === c.Id);
        if (match) {
          return { ...c, State: match.state, Status: match.status };
        }
        return c;
      });
      return { ...prev, containers: updated };
    });
  }, [dockerSSE]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2
            className="w-12 h-12 animate-spin mx-auto mb-4"
            style={{ color: "var(--accent)" }}
          />
          <p style={{ color: "var(--text-secondary)" }}>
            Loading Docker status...
          </p>
        </div>
      </div>
    );
  }

  // Not configured
  if (!data || data.state === "not_configured") {
    return (
      <div className="space-y-6">
        <Header />
        <div
          className="p-8 rounded-xl text-center"
          style={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
          }}
        >
          <Settings2
            className="w-12 h-12 mx-auto mb-4"
            style={{ color: "var(--text-muted)" }}
          />
          <h2
            className="text-lg font-semibold mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            Docker not configured
          </h2>
          <p
            className="mb-4"
            style={{
              color: "var(--text-secondary)",
              maxWidth: "480px",
              margin: "0 auto",
            }}
          >
            Set DOCKER_HOST in .env.local to connect to a remote Docker host.
          </p>
          <pre
            className="text-left inline-block rounded-lg p-4 text-sm"
            style={{
              backgroundColor: "#0d1117",
              color: "#c9d1d9",
              fontFamily: "monospace",
              border: "1px solid var(--border)",
            }}
          >
            {`# .env.local\nDOCKER_HOST=unix:///var/run/docker.sock\n# or\nDOCKER_HOST=tcp://your-server:2375`}
          </pre>
        </div>
      </div>
    );
  }

  // Unreachable
  if (data.state === "unreachable") {
    return (
      <div className="space-y-6">
        <Header />
        <div
          className="p-8 rounded-xl text-center"
          style={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
          }}
        >
          <AlertTriangle
            className="w-12 h-12 mx-auto mb-4"
            style={{ color: "var(--error)" }}
          />
          <h2
            className="text-lg font-semibold mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            Docker host unreachable
          </h2>
          <p
            style={{
              color: "var(--text-secondary)",
              maxWidth: "480px",
              margin: "0 auto",
            }}
          >
            Check your DOCKER_HOST configuration and ensure the Docker daemon is
            running.
          </p>
        </div>
      </div>
    );
  }

  // Available — show tabs
  const containers = data.containers ?? [];
  const images = data.images ?? [];

  const tabs: { id: Tab; label: string; icon: typeof Container }[] = [
    { id: "containers", label: "Containers", icon: Container },
    { id: "images", label: "Images", icon: Image },
    { id: "system", label: "System", icon: Server },
  ];

  return (
    <div className="space-y-6">
      <Header />

      {/* Tabs */}
      <div
        className="flex gap-2 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-4 py-2 font-medium transition-all"
              style={{
                color: isActive ? "var(--accent)" : "var(--text-secondary)",
                borderBottom: isActive
                  ? "2px solid var(--accent)"
                  : "2px solid transparent",
                background: "none",
                border: "none",
                borderBottomWidth: "2px",
                borderBottomStyle: "solid",
                borderBottomColor: isActive ? "var(--accent)" : "transparent",
                cursor: "pointer",
              }}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Container tab */}
      {tab === "containers" && (
        <div>
          {containers.length === 0 ? (
            <div
              className="p-6 rounded-xl text-center"
              style={{
                backgroundColor: "var(--card)",
                border: "1px solid var(--border)",
              }}
            >
              <p style={{ color: "var(--text-secondary)" }}>
                No containers found.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {containers.map((c) => (
                <ContainerCard
                  key={c.Id}
                  container={c}
                  canAct={!!canAct}
                  onViewLogs={(id, name) => setLogTarget({ id, name })}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Images tab */}
      {tab === "images" && <ImageList images={images} />}

      {/* System tab */}
      {tab === "system" && data.systemInfo && (
        <SystemInfo
          systemInfo={data.systemInfo}
          diskUsage={data.diskUsage ?? null}
        />
      )}

      {/* Log viewer modal */}
      {logTarget && (
        <LogViewer
          containerId={logTarget.id}
          containerName={logTarget.name}
          onClose={() => setLogTarget(null)}
        />
      )}
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1
        className="text-3xl font-bold mb-2"
        style={{
          fontFamily: "var(--font-heading)",
          color: "var(--text-primary)",
        }}
      >
        Docker Management
      </h1>
      <p style={{ color: "var(--text-secondary)" }}>
        Monitor and manage Docker containers, images, and system resources
      </p>
    </div>
  );
}
