// Errores de dominio que `handler()` (src/server/http.ts) traduce a HTTP.
// Los servicios lanzan estos errores; nunca construyen respuestas.

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "No encontrado") {
    super(404, message);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = "No autenticado") {
    super(401, message);
  }
}
