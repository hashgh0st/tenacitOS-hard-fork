/**
 * Next.js Instrumentation Hook
 *
 * Runs once on server startup. Starts the event bus pollers and
 * filesystem watchers that feed all SSE endpoints.
 *
 * Dynamic imports keep server-only code out of Edge and client bundles.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startPollers } = await import('@/lib/events/pollers');
    const { startWatchers } = await import('@/lib/events/watchers');
    const { initResolverSubscriptions } = await import('@/lib/alerts/resolvers');
    const { startAlertEngine } = await import('@/lib/alerts/engine');
    startPollers();
    startWatchers();
    initResolverSubscriptions();
    startAlertEngine();
  }
}
