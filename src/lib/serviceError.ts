export class ServiceError extends Error {
  readonly operation: string;
  readonly originalCause: unknown;

  constructor(operation: string, cause: unknown) {
    super(`Service operation failed: ${operation}`);
    this.name = 'ServiceError';
    this.operation = operation;
    this.originalCause = cause;
  }
}

export function failService(operation: string, cause: unknown): never {
  console.error(`Service operation failed: ${operation}`, cause);
  throw new ServiceError(operation, cause);
}

export function getUserErrorMessage(_error: unknown, fallback: string): string {
  return fallback;
}
