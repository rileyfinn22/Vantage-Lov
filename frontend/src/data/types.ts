// Helper to extract data type from Hono client response
// Excludes error responses from the union since fetch will throw on errors
export type ExtractData<T extends (...args: any) => any> = ReturnType<T> extends Promise<{ json: () => Promise<infer U> }>
    ? Exclude<U, { error: any }>
    : never;
