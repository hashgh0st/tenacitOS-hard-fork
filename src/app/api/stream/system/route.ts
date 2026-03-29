import { createSSEHandler } from '@/lib/events/sse';

export const dynamic = 'force-dynamic';
export const GET = createSSEHandler('system:metrics');
