import { reportError } from '@/monitoring/error-reporting';

export function reportAdError(error: unknown, context: string) {
  const details = error && typeof error === 'object'
    ? error as { message?: string; code?: string; reason?: string; phase?: string }
    : {};
  const message = [details.code, details.reason, details.phase, details.message ?? String(error)]
    .filter(Boolean).join(' | ');
  // Preserve native ad error details in release builds too, including for guests.
  console.warn(`[${context}] ${message}`);
  void reportError(new Error(message), context);
}
