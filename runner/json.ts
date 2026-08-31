// JSON.parse without the throw. Malformed text and a bare `null` yield an
// empty object, and a non-object scalar yields itself, so every caller can read
// fields off the result without a guard of its own.
export function parseJsonObject(text: string): { [key: string]: unknown } {
  try {
    return JSON.parse(text) ?? {};
  } catch {
    return {};
  }
}
