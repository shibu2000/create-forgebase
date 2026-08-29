import { logger } from './logger.js';

/**
 * Boot and shutdown registries.
 *
 * Fragments that own a resource — a database pool, a mail transport, a queue
 * consumer — register here instead of being wired into `server.ts` by hand.
 * Keeping the registries in their own module also means a fragment can call
 * `onShutdown` without importing `server.ts`, which would be a cycle.
 */

export type BootTask = () => Promise<void> | void;
export type ShutdownHook = () => Promise<void> | void;

const bootTasks: { name: string; task: BootTask }[] = [];
const shutdownHooks: { name: string; hook: ShutdownHook }[] = [];

/** Runs before the HTTP server starts listening. Throwing aborts the boot. */
export function onBoot(name: string, task: BootTask): void {
  bootTasks.push({ name, task });
}

/** Runs after in-flight requests have drained, in reverse registration order. */
export function onShutdown(name: string, hook: ShutdownHook): void {
  shutdownHooks.push({ name, hook });
}

/**
 * Sequential on purpose: a later task may depend on an earlier one, and a
 * failure should surface before the process starts accepting traffic.
 */
export async function runBootTasks(): Promise<void> {
  for (const { name, task } of bootTasks) {
    await task();
    logger.info({ task: name }, 'Boot task completed');
  }
}

/**
 * Reverse order, so resources are released in the opposite order they were
 * acquired. A failing hook is logged and the rest still run — shutdown must
 * make progress.
 */
export async function runShutdownHooks(): Promise<void> {
  for (const { name, hook } of [...shutdownHooks].reverse()) {
    try {
      await hook();
      logger.info({ hook: name }, 'Shutdown hook completed');
    } catch (error) {
      logger.error({ err: error, hook: name }, 'Shutdown hook failed');
    }
  }
}

/** Test helper — drops every registration. */
export function clearLifecycleHooks(): void {
  bootTasks.length = 0;
  shutdownHooks.length = 0;
}
