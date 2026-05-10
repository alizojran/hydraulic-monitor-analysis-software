/**
 * Typed wrappers around the Tauri Modbus commands defined in src-tauri/src/modbus.rs.
 * All functions throw if called outside the Tauri desktop context.
 */
declare global {
  interface Window {
    __TAURI__?: unknown
  }
}

export function isTauriApp(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriApp()) throw new Error('Tauri runtime not available')
  // @ts-expect-error — injected by Tauri at runtime
  const { invoke: tauriInvoke } = await import(/* @vite-ignore */ '@tauri-apps/api/core') as { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<T> }
  return tauriInvoke(cmd, args)
}

export interface ModbusConnectArgs {
  host: string
  port: number
  unitId: number
}

export interface ModbusReadResult {
  registers: number[]
  address: number
  count: number
}

export const modbus = {
  connect: (args: ModbusConnectArgs) =>
    invoke<void>('modbus_connect', { args }),

  disconnect: () =>
    invoke<void>('modbus_disconnect'),

  readHolding: (address: number, count: number) =>
    invoke<ModbusReadResult>('modbus_read_holding', { address, count }),

  readInput: (address: number, count: number) =>
    invoke<ModbusReadResult>('modbus_read_input', { address, count }),

  writeSingle: (address: number, value: number) =>
    invoke<void>('modbus_write_single', { address, value }),
}
