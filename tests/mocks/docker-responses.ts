/**
 * Canned Docker Engine API responses for unit tests.
 *
 * These mirror the JSON structures returned by the Docker Engine REST API.
 */

export const MOCK_CONTAINERS = [
  {
    Id: 'abc123def456789012345678901234567890123456789012345678901234',
    Names: ['/nginx-proxy'],
    Image: 'nginx:latest',
    State: 'running',
    Status: 'Up 3 hours',
    Ports: [
      { PrivatePort: 80, PublicPort: 8080, Type: 'tcp' },
      { PrivatePort: 443, PublicPort: 8443, Type: 'tcp' },
    ],
    Created: 1700000000,
  },
  {
    Id: 'def456abc789012345678901234567890123456789012345678901234567',
    Names: ['/redis-cache'],
    Image: 'redis:7-alpine',
    State: 'exited',
    Status: 'Exited (0) 2 days ago',
    Ports: [],
    Created: 1699900000,
  },
  {
    Id: 'fff999aaa111222333444555666777888999000aaabbbcccdddeeefffaaa',
    Names: ['/postgres-db'],
    Image: 'postgres:16',
    State: 'running',
    Status: 'Up 5 days',
    Ports: [{ PrivatePort: 5432, PublicPort: 5432, Type: 'tcp' }],
    Created: 1699500000,
  },
];

export const MOCK_IMAGES = [
  {
    Id: 'sha256:abc123',
    RepoTags: ['nginx:latest'],
    Size: 142_000_000,
    Created: 1700000000,
  },
  {
    Id: 'sha256:def456',
    RepoTags: ['redis:7-alpine'],
    Size: 30_000_000,
    Created: 1699900000,
  },
  {
    Id: 'sha256:ghi789',
    RepoTags: ['postgres:16'],
    Size: 380_000_000,
    Created: 1699500000,
  },
];

export const MOCK_VERSION = {
  Version: '24.0.7',
  ApiVersion: '1.43',
  MinAPIVersion: '1.12',
  Os: 'linux',
  Arch: 'amd64',
};

export const MOCK_INFO = {
  Containers: 3,
  ContainersRunning: 2,
  ContainersPaused: 0,
  ContainersStopped: 1,
  Images: 3,
  ServerVersion: '24.0.7',
};

export const MOCK_DISK_USAGE = {
  LayersSize: 552_000_000,
  Containers: [],
  Volumes: [],
  Images: [],
  BuildCache: [],
};

export const MOCK_PRUNE_CONTAINERS = {
  ContainersDeleted: ['def456abc789'],
  SpaceReclaimed: 1024,
};

export const MOCK_PRUNE_IMAGES = {
  ImagesDeleted: [
    { Untagged: 'old-image:latest' },
    { Deleted: 'sha256:oldabc123' },
  ],
  SpaceReclaimed: 50_000_000,
};

/**
 * Helper: Build a mock HTTP response buffer for a given JSON payload.
 */
export function mockJsonResponse(data: unknown): string {
  return JSON.stringify(data);
}
