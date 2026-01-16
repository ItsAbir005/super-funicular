export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode = 500,
    isOperational = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}
export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404);
  }
}
export class ValidationError extends AppError {
  constructor(message = "Invalid request") {
    super(message, 400);
  }
}
export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(message, 409);
  }
}
