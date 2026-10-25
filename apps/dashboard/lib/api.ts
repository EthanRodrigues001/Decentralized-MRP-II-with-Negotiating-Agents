// Small helper so route handlers turn thrown errors into 400s instead of 500s
// for validation problems, and keep the response shape consistent.
export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await fn());
  } catch (err) {
    const message = err instanceof Error ? err.message : "unexpected error";
    // Postgres rejects malformed uuids with this message; that is a bad request, not a crash.
    const status = /invalid input syntax for type uuid/.test(message) ? 400 : /must be|required|would take|cannot|not in|not awaiting|unknown/.test(message) ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (typeof body !== "object" || body === null) throw new Error("body must be an object");
    return body as Record<string, unknown>;
  } catch {
    throw new Error("body must be valid JSON");
  }
}
