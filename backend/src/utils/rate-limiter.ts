/**
 * Rate limiting utilities for external API requests.
 * Used to avoid HTTP 429 (Too Many Requests) from GDT portal
 * when downloading multiple invoices in sequence.
 */

/**
 * Delay execution for a given number of milliseconds.
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable.
 * Only retry on HTTP 429 (Too Many Requests) from GDT rate limiting.
 */
export function isRetryableError(error: any): boolean {
  const status = error?.response?.status;

  // HTTP 429 Too Many Requests — rate limited, worth retrying after delay
  if (status === 429) return true;

  return false;
}

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 2000) */
  baseDelayMs?: number;
  /** Maximum delay cap in ms (default: 15000) */
  maxDelayMs?: number;
  /** Custom logger function */
  logger?: (message: string) => void;
}

/**
 * Execute an async function with automatic retry on retryable errors.
 * Uses exponential backoff: delay = min(baseDelay * 2^(attempt-1), maxDelay).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const envMaxRetries = process.env.DOWNLOAD_MAX_RETRIES ? parseInt(process.env.DOWNLOAD_MAX_RETRIES, 10) : undefined;
  const {
    maxRetries = envMaxRetries ?? 3,
    baseDelayMs = 2000,
    maxDelayMs = 15000,
    logger = console.warn,
  } = options;

  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      if (attempt <= maxRetries && isRetryableError(error)) {
        const waitMs = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
        const status = error?.response?.status || error?.code || 'unknown';
        logger(`[RateLimiter] Attempt ${attempt}/${maxRetries + 1} failed (${status}), retrying in ${waitMs}ms...`);
        await delay(waitMs);
        continue;
      }

      throw error;
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError;
}

export interface BatchOptions extends RetryOptions {
  /** Number of items to process per batch (default: 5) */
  batchSize?: number;
  /** Delay between items in ms (default: 1500) */
  itemDelayMs?: number;
  /** Extra delay between batches in ms (default: 10000) */
  batchDelayMs?: number;
  /** Called after each item is processed */
  onProgress?: (completed: number, total: number, item: any) => void;
}

/**
 * Process an array of items with rate limiting:
 * - Items are processed sequentially with a delay between each
 * - Items are grouped into batches with a longer delay between batches
 * - Each item uses withRetry for retryable errors
 */
export async function processWithRateLimit<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  options: BatchOptions = {}
): Promise<{ results: R[]; errors: Error[] }> {
  const envBatchSize = process.env.DOWNLOAD_BATCH_SIZE ? parseInt(process.env.DOWNLOAD_BATCH_SIZE, 10) : undefined;
  const envItemDelayMs = process.env.DOWNLOAD_DELAY_MS ? parseInt(process.env.DOWNLOAD_DELAY_MS, 10) : undefined;
  const envBatchDelayMs = process.env.DOWNLOAD_BATCH_DELAY_MS ? parseInt(process.env.DOWNLOAD_BATCH_DELAY_MS, 10) : undefined;
  const envMaxRetries = process.env.DOWNLOAD_MAX_RETRIES ? parseInt(process.env.DOWNLOAD_MAX_RETRIES, 10) : undefined;
  const {
    batchSize = envBatchSize ?? 5,
    itemDelayMs = envItemDelayMs ?? 1500,
    batchDelayMs = envBatchDelayMs ?? 10000,
    maxRetries = envMaxRetries ?? 3,
    baseDelayMs = 2000,
    maxDelayMs = 15000,
    logger = console.warn,
    onProgress,
  } = options;

  const results: R[] = [];
  const errors: Error[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    for (let j = 0; j < batch.length; j++) {
      const item = batch[j];
      try {
        const result = await withRetry(() => processor(item), {
          maxRetries,
          baseDelayMs,
          maxDelayMs,
          logger,
        });
        results.push(result);
      } catch (error: any) {
        errors.push(error);
      }

      // Delay between items (skip last item of last batch)
      const isLastItem = i + j === items.length - 1;
      if (!isLastItem) {
        await delay(itemDelayMs);
      }

      if (onProgress) {
        onProgress(i + j + 1, items.length, item);
      }
    }

    // Delay between batches (skip if it's the last batch)
    const isLastBatch = i + batchSize >= items.length;
    if (!isLastBatch) {
      logger(`[RateLimiter] Batch complete, waiting ${batchDelayMs}ms before next batch...`);
      await delay(batchDelayMs);
    }
  }

  return { results, errors };
}
