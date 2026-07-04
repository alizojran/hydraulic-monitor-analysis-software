export interface PersistedRecord<T> {
  _version: number
  data: T
}

export interface PersistOptions<T> {
  key: string
  version: number
  migrations?: Record<number, (oldData: unknown) => unknown>
  validate?: (data: unknown) => T | null
}

/**
 * Load a versioned value from localStorage.
 * - Data without `_version` is treated as version 1 and migrated.
 * - Migrations are run sequentially from the stored version up to `opts.version`.
 * - Returns null if the key is absent, JSON is corrupt, or validate() rejects.
 */
export function loadPersisted<T>(opts: PersistOptions<T>): T | null {
  try {
    const raw = localStorage.getItem(opts.key)
    if (raw === null) return null

    const parsed: unknown = JSON.parse(raw)

    let version = 1
    let data: unknown

    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      '_version' in (parsed as object) &&
      'data' in (parsed as object)
    ) {
      const record = parsed as PersistedRecord<unknown>
      version = record._version
      data = record.data
    } else {
      // Legacy format — no version envelope; treat raw value as v1 data
      data = parsed
    }

    // Run migrations from stored version up to target version
    if (opts.migrations) {
      for (let v = version; v < opts.version; v++) {
        const migrate = opts.migrations[v]
        if (migrate) data = migrate(data)
      }
    }

    if (opts.validate) {
      return opts.validate(data)
    }
    return data as T
  } catch {
    return null
  }
}

/**
 * Save a versioned value to localStorage.
 * Dispatches `hmas-storage-quota` custom event when storage is full.
 * Returns true on success, false on failure.
 */
export function savePersisted<T>(opts: PersistOptions<T>, data: T): boolean {
  try {
    const record: PersistedRecord<T> = { _version: opts.version, data }
    localStorage.setItem(opts.key, JSON.stringify(record))
    return true
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      window.dispatchEvent(new CustomEvent('hmas-storage-quota', { detail: { key: opts.key } }))
    }
    return false
  }
}
