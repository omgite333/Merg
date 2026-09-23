export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: any): string {
  if (typeof error?.message === "string") return error.message;
  if (typeof error?.error?.message === "string") return error.error.message;
  return "";
}

export function isRateLimitError(error: any): boolean {
  const message = errorMessage(error);
  return (
    error?.status === 429 ||
    error?.response?.status === 429 ||
    error?.error?.code === "rate_limit_exceeded" ||
    error?.error?.type === "tokens" ||
    message.includes("rate_limit_exceeded") ||
    /try again in [\d.]+s/i.test(message)
  );
}

export function getRetryDelayMs(error: any, attempt: number): number {
  const message = errorMessage(error);
  const match = message.match(/try again in ([\d.]+)s/i);
  if (match) return Math.ceil(parseFloat(match[1]!) * 1000) + 1000;
  return Math.min(60_000, 2 ** attempt * 1000);
}

export async function invokeWithRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 5
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      if (isRateLimitError(error) && attempt < maxRetries) {
        const delay = getRetryDelayMs(error, attempt);
        console.warn(
          `[${label}] Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`
        );
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
}