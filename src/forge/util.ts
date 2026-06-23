/** Parse a JSON array/object out of model output, tolerating stray code fences. */
export function parseJsonBlock<T>(s: string): T | null {
  try {
    return JSON.parse(s.replace(/```json/g, '').replace(/```/g, '').trim()) as T;
  } catch {
    return null;
  }
}
