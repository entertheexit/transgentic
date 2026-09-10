import type { CliState } from '../../shared/cli.js';

export async function loadCliState(api?: { getCliState?: () => Promise<CliState> }, timeoutMs = 10000): Promise<CliState> {
  if (typeof api?.getCliState !== 'function') {
    throw new Error('The desktop bridge is out of date. Stop and restart npm run dev to load CLI Services.');
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const state = await Promise.race([
      api.getCliState(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('CLI Services did not respond. Restart Transgentic and try again.')), timeoutMs);
      }),
    ]);
    if (!state?.config?.services || !Array.isArray(state.config.workspaces) || !state.statuses) {
      throw new Error('The desktop bridge returned invalid CLI settings. Restart Transgentic to load the latest version.');
    }
    return state;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
