/** Bound provider DOM inspection without allowing late results to update status. */
export async function boundedTemporaryChatProbe<T>(inspect: () => Promise<T>, timeoutMs = 8_000): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      inspect(),
      new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), timeoutMs); }),
    ]);
  } catch { return undefined; }
  finally { if (timer) clearTimeout(timer); }
}
