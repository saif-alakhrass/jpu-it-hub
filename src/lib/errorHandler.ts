/**
 * Centralized error handling utilities
 */

export enum ErrorType {
  NETWORK = 'NETWORK',
  VALIDATION = 'VALIDATION',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  NOT_FOUND = 'NOT_FOUND',
  SERVER = 'SERVER',
  UNKNOWN = 'UNKNOWN',
}

export class AppError extends Error {
  constructor(
    message: string,
    public type: ErrorType = ErrorType.UNKNOWN,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NetworkError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ErrorType.NETWORK, 0, details);
    this.name = 'NetworkError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ErrorType.VALIDATION, 400, details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ErrorType.AUTHENTICATION, 401, details);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ErrorType.AUTHORIZATION, 403, details);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ErrorType.NOT_FOUND, 404, details);
    this.name = 'NotFoundError';
  }
}

export class ServerError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ErrorType.SERVER, 500, details);
    this.name = 'ServerError';
  }
}

export function classifyError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    // Try to classify based on error message or properties
    const message = error.message.toLowerCase();
    
    if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
      return new NetworkError(error.message);
    }
    
    if (message.includes('unauthorized') || message.includes('authentication')) {
      return new AuthenticationError(error.message);
    }
    
    if (message.includes('forbidden') || message.includes('permission')) {
      return new AuthorizationError(error.message);
    }
    
    if (message.includes('not found') || message.includes('404')) {
      return new NotFoundError(error.message);
    }
    
    if (message.includes('validation') || message.includes('invalid')) {
      return new ValidationError(error.message);
    }
    
    return new ServerError(error.message);
  }

  return new AppError('An unknown error occurred', ErrorType.UNKNOWN);
}

export function getUserFriendlyMessage(error: AppError): string {
  switch (error.type) {
    case ErrorType.NETWORK:
      return 'حدث خطأ في الاتصال. يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.';
    case ErrorType.VALIDATION:
      return 'البيانات المدخلة غير صحيحة. يرجى التحقق والمحاولة مرة أخرى.';
    case ErrorType.AUTHENTICATION:
      return 'يجب تسجيل الدخول للوصول إلى هذه الميزة.';
    case ErrorType.AUTHORIZATION:
      return 'ليس لديك صلاحية للوصول إلى هذه الميزة.';
    case ErrorType.NOT_FOUND:
      return 'المورد المطلوب غير موجود.';
    case ErrorType.SERVER:
      return 'حدث خطأ في الخادم. يرجى المحاولة مرة أخرى لاحقاً.';
    default:
      return 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.';
  }
}

export function logError(error: unknown, context?: Record<string, unknown>): void {
  const appError = classifyError(error);
  
  const logEntry = {
    timestamp: new Date().toISOString(),
    type: appError.type,
    message: appError.message,
    statusCode: appError.statusCode,
    details: appError.details,
    context,
  };

  if (appError.type === ErrorType.SERVER || appError.type === ErrorType.UNKNOWN) {
    console.error('Error:', JSON.stringify(logEntry));
  } else {
    console.warn('Error:', JSON.stringify(logEntry));
  }
}

export function handleApiError(error: unknown): { message: string; type: ErrorType } {
  const appError = classifyError(error);
  return {
    message: getUserFriendlyMessage(appError),
    type: appError.type,
  };
}