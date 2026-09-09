import { RuntimeFault } from "./errors.js";
export async function withDeadline<T>(
  send: () => Promise<T>,
  controller: AbortController,
  deadlineMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      send(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new RuntimeFault("UNKNOWN_OUTCOME", "reconcile-first"));
        }, deadlineMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
