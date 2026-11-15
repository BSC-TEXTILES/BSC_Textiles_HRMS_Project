/** Gate database-dependent startup and never report failed tasks as successful. */
export async function runStartupChecks(
  preflight: () => Promise<unknown>,
  tasks: Array<{ name: string; run: () => Promise<unknown> }>,
  warn: (message: string) => void = console.warn,
): Promise<string[]> {
  // Let the caller handle this once; do not run dozens of tasks on bad credentials.
  await preflight();
  const failed: string[] = [];
  for (const task of tasks) {
    try {
      await task.run();
    } catch (error: any) {
      failed.push(task.name);
      // Error codes are useful without logging connection strings or SQL data.
      warn(`[startup] ${task.name} failed (${error?.code || 'INITIALIZATION_ERROR'}).`);
    }
  }
  return failed;
}
