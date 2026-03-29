import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";

// GET: Fetch run history for a cron job
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Job ID required" }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
    }

    let runs: RunEntry[] = [];

    try {
      const output = execSync(`openclaw cron runs ${id} --json 2>/dev/null`, {
        timeout: 10000,
        encoding: "utf-8",
      });

      const data = JSON.parse(output);
      const rawRuns: RawRun[] = data.runs || data || [];

      runs = rawRuns.map((r: RawRun) => ({
        id: r.id || `${id}-${r.startedAt}`,
        jobId: id,
        startedAt: r.startedAt || r.createdAt || null,
        completedAt: r.completedAt || r.finishedAt || null,
        status: r.status || "unknown",
        durationMs:
          r.durationMs ||
          (r.startedAt && r.completedAt
            ? new Date(r.completedAt).getTime() - new Date(r.startedAt).getTime()
            : null),
        error: r.error || null,
      }));
    } catch {
      // Command might not support runs yet or no history — return empty
      runs = [];
    }

    return NextResponse.json({ runs, total: runs.length });
  } catch (error) {
    console.error("Error fetching run history:", error);
    return NextResponse.json({ error: "Failed to fetch run history" }, { status: 500 });
  }
}

interface RawRun {
  id?: string;
  startedAt?: string;
  createdAt?: string;
  completedAt?: string;
  finishedAt?: string;
  status?: string;
  durationMs?: number;
  error?: string;
}

interface RunEntry {
  id: string;
  jobId: string;
  startedAt: string | null;
  completedAt: string | null;
  status: string;
  durationMs: number | null;
  error: string | null;
}
