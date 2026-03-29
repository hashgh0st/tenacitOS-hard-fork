import { withAuth } from '@/lib/auth/withAuth';
import { listApprovals } from '@/lib/gateway/client';

async function handleGet() {
  try {
    const approvals = await listApprovals();
    const count = approvals.filter(a => a.status === 'pending').length;
    return Response.json({ count });
  } catch {
    return Response.json({ count: 0 });
  }
}

export const GET = withAuth(handleGet, { requiredRole: 'operator' });
