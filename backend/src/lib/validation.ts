import type { Response } from "express";
import type { ZodError } from "zod";

/**
 * Send a 400 for a failed `safeParse`.
 *
 * Every caller used to do `res.json({ error: result.error.flatten().fieldErrors })`,
 * which puts an *object* — `{ email: ["Invalid email"] }` — on `error`. The
 * frontend reads `response.data.error` and drops it straight into an `<Alert>`,
 * so React was handed an object as a child and threw
 * "Objects are not valid as a React child". That took down the whole tree to
 * the Sentry ErrorBoundary: typing an address Chrome accepts but zod rejects
 * (e.g. `test@test`) replaced the sign-in page with "Something went wrong."
 *
 * `error` is now always a human-readable string. The per-field detail is still
 * available under `fieldErrors` for any caller that wants to highlight inputs.
 */
export function sendValidationError(res: Response, error: ZodError): void {
  const fieldErrors = error.flatten().fieldErrors;
  const message =
    Object.values(fieldErrors)
      .flat()
      .filter((m): m is string => typeof m === "string" && m.length > 0)
      .join(". ") || "Invalid request";

  res.status(400).json({ error: message, fieldErrors });
}
