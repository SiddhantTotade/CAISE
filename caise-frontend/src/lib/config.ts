/** Build-time configuration; the API prefix must match API_V1_STR on the backend. */
export const API_PREFIX: string = import.meta.env.VITE_API_PREFIX;

if (!API_PREFIX) {
  throw new Error("VITE_API_PREFIX is not set (see .env.example)");
}
