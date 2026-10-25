/** An error with an HTTP status, safe to show to the user. Thrown by services, rendered by API routes. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
