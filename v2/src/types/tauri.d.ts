/**
 * Type stub for optional Tauri runtime imports.
 * The actual module is injected at runtime when running inside the Tauri desktop shell.
 * This stub satisfies TypeScript without requiring the package to be installed.
 */
declare module '@tauri-apps/api/core' {
  export function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>
}
