"use client";

import { formatDistanceToNow } from "date-fns";
import type { DockerImage } from "@/lib/docker/types";

interface ImageListProps {
  images: DockerImage[];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function repoTag(image: DockerImage): string {
  if (!image.RepoTags || image.RepoTags.length === 0) return "<none>:<none>";
  return image.RepoTags[0];
}

export function ImageList({ images }: ImageListProps) {
  if (images.length === 0) {
    return (
      <div
        className="p-6 rounded-xl text-center"
        style={{
          backgroundColor: "var(--card)",
          border: "1px solid var(--border)",
        }}
      >
        <p style={{ color: "var(--text-secondary)" }}>No images found.</p>
      </div>
    );
  }

  return (
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
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th
                className="text-left py-3 px-4 text-sm font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                Repository:Tag
              </th>
              <th
                className="text-right py-3 px-4 text-sm font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                Size
              </th>
              <th
                className="text-right py-3 px-4 text-sm font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                Created
              </th>
            </tr>
          </thead>
          <tbody>
            {images.map((image, i) => (
              <tr
                key={image.Id}
                style={{
                  borderBottom:
                    i < images.length - 1
                      ? "1px solid var(--border)"
                      : undefined,
                  backgroundColor:
                    i % 2 === 1 ? "var(--card-elevated)" : undefined,
                }}
              >
                <td className="py-3 px-4">
                  <span
                    className="font-mono text-sm"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {repoTag(image)}
                  </span>
                </td>
                <td
                  className="py-3 px-4 text-right text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {formatSize(image.Size)}
                </td>
                <td
                  className="py-3 px-4 text-right text-sm"
                  style={{ color: "var(--text-muted)" }}
                >
                  {formatDistanceToNow(new Date(image.Created * 1000), {
                    addSuffix: true,
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
