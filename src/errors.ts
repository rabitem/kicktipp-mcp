export class KicktippError extends Error {
  constructor(message: string, readonly code = 'KICKTIPP_ERROR') {
    super(message);
    this.name = 'KicktippError';
  }
}

export class AuthError extends KicktippError {
  constructor(message: string) {
    super(message, 'AUTH_ERROR');
    this.name = 'AuthError';
  }
}

export class ParseError extends KicktippError {
  constructor(message: string, readonly selector?: string) {
    super(selector ? `${message} (${selector})` : message, 'PARSE_ERROR');
    this.name = 'ParseError';
  }
}

export class UnsafeWriteError extends KicktippError {
  constructor(message: string) {
    super(message, 'UNSAFE_WRITE');
    this.name = 'UnsafeWriteError';
  }
}
