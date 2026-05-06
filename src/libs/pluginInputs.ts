import { storage } from '../lib/storage';

type PluginInputValues = Record<string, string>;

function asString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return String(value);
}

export const inputs = {
  get(key: string): string | null {
    return asString(storage.get(key));
  },
  getAll(): PluginInputValues {
    const values: PluginInputValues = {};
    for (const key of storage.getAllKeys()) {
      values[key] = asString(storage.get(key)) ?? '';
    }
    return values;
  },
  has(key: string): boolean {
    return asString(storage.get(key)) !== null;
  },
  require(key: string): string {
    const value = asString(storage.get(key));
    if (value === null || value.trim() === '') {
      throw new Error(`Plugin input '${key}' is not configured.`);
    }
    return value;
  },
};

export const pluginInputs = inputs;
