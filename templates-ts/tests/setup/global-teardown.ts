/**
 * Stops the throwaway PostgreSQL container. Runs even when tests fail, so a
 * red suite does not leave a container behind.
 */
export default async function globalTeardown(): Promise<void> {
  await globalThis.__PG_CONTAINER__?.stop();
}
