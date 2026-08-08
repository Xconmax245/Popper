/**
 * Robust JSON extraction from LLM output.
 *
 * Free/open models are inconsistent about how they wrap JSON: sometimes a
 * ```json fence, sometimes a bare ``` fence, sometimes leading prose
 * ("Here is the JSON:"), sometimes trailing commentary. The naive
 * `replace(/^```json/, '')` approach in the original agents only handled the
 * first case and silently failed on the rest — turning every verdict into an
 * unparseable "unverifiable". This helper is the single parse path for all
 * agents so extraction, verification, and synthesis stay reliable.
 */

/**
 * Pull the first well-formed JSON object or array out of arbitrary model text.
 * Throws if no parseable JSON can be found.
 */
export function extractJson(content: string): unknown {
  if (!content || !content.trim()) {
    throw new Error('Empty model output — nothing to parse.');
  }

  let s = content.trim();

  // Strip a leading code fence with optional language tag (```json, ```JSON, ```)
  s = s.replace(/^```[a-zA-Z0-9]*\s*\n?/, '');
  // Strip a trailing code fence
  s = s.replace(/\n?```$/, '').trim();

  // Fast path: the whole string is valid JSON.
  try {
    return JSON.parse(s);
  } catch {
    // Fall through to bracket extraction.
  }

  // Locate the first opening bracket ({ or [) and its matching close.
  const firstObj = s.indexOf('{');
  const firstArr = s.indexOf('[');

  let start: number;
  if (firstObj === -1 && firstArr === -1) {
    throw new Error(`No JSON object or array found in model output: ${s.slice(0, 120)}`);
  } else if (firstObj === -1) {
    start = firstArr;
  } else if (firstArr === -1) {
    start = firstObj;
  } else {
    start = Math.min(firstObj, firstArr);
  }

  const openChar = s[start];
  const closeChar = openChar === '{' ? '}' : ']';
  const end = s.lastIndexOf(closeChar);

  if (end === -1 || end < start) {
    throw new Error(`Unbalanced JSON in model output: ${s.slice(0, 120)}`);
  }

  const candidate = s.slice(start, end + 1);
  return JSON.parse(candidate);
}

/**
 * Convenience wrapper: extract JSON and validate it against a Zod schema in
 * one call. `schema` is any object with a `.parse(unknown) => T` method.
 */
export function extractJsonAs<T>(content: string, schema: { parse: (input: unknown) => T }): T {
  return schema.parse(extractJson(content));
}
