/**
 * TypeScript interfaces for Docker Engine API responses.
 *
 * These mirror the Docker Engine API JSON structures.
 * See: https://docs.docker.com/engine/api/v1.43/
 */

export interface DockerContainer {
  Id: string;
  Names: string[];
  Image: string;
  State: string;        // running, exited, paused, etc.
  Status: string;       // "Up 3 hours", "Exited (0) 2 days ago"
  Ports: DockerPort[];
  Created: number;
}

export interface DockerPort {
  PrivatePort: number;
  PublicPort?: number;
  Type: string;
}

export interface DockerImage {
  Id: string;
  RepoTags: string[];
  Size: number;
  Created: number;
}

export interface DockerSystemInfo {
  ServerVersion: string;
  Containers: number;
  ContainersRunning: number;
  ContainersStopped: number;
  Images: number;
}

export interface DockerDiskUsage {
  LayersSize: number;
}

export type DockerState = 'not_configured' | 'unreachable' | 'available';
