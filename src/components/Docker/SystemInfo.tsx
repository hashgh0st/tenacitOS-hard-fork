"use client";

import { Server, Box, Image, HardDrive } from "lucide-react";
import type {
  DockerSystemInfo as DockerSystemInfoType,
  DockerDiskUsage,
} from "@/lib/docker/types";

interface SystemInfoProps {
  systemInfo: DockerSystemInfoType;
  diskUsage: DockerDiskUsage | null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}

function StatCard({ icon, label, value, sub }: StatCardProps) {
  return (
    <div
      className="p-5 rounded-xl"
      style={{
        backgroundColor: "var(--card)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="p-2 rounded-lg"
          style={{ backgroundColor: "var(--card-elevated)" }}
        >
          {icon}
        </div>
        <span
          className="text-sm font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          {label}
        </span>
      </div>
      <div
        className="text-2xl font-bold"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </div>
      {sub && (
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          {sub}
        </p>
      )}
    </div>
  );
}

export function SystemInfo({ systemInfo, diskUsage }: SystemInfoProps) {
  const running = systemInfo.ContainersRunning;
  const stopped = systemInfo.ContainersStopped;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        icon={
          <Server className="w-5 h-5" style={{ color: "var(--accent)" }} />
        }
        label="Docker Version"
        value={systemInfo.ServerVersion}
      />
      <StatCard
        icon={
          <Box className="w-5 h-5" style={{ color: "var(--success)" }} />
        }
        label="Containers"
        value={String(systemInfo.Containers)}
        sub={`${running} running / ${stopped} stopped`}
      />
      <StatCard
        icon={
          <Image className="w-5 h-5" style={{ color: "var(--warning)" }} />
        }
        label="Images"
        value={String(systemInfo.Images)}
      />
      <StatCard
        icon={
          <HardDrive
            className="w-5 h-5"
            style={{ color: "var(--info, #3b82f6)" }}
          />
        }
        label="Disk Usage"
        value={diskUsage ? formatSize(diskUsage.LayersSize) : "N/A"}
        sub="Total layer size"
      />
    </div>
  );
}
