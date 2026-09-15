let database: Record<string, any>;
export function setMeasurementDatabase(value: any) { database = value; }
export const supabase = new Proxy({} as Record<string, any>, {
  get: (_target, key: string) => database[key],
});
