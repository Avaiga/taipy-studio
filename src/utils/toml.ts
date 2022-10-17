export const getPropertyValue = <T>(toml: any, defaultValue: T, ...names: string[]): [T, boolean] => {
  if (!toml) {
    return [defaultValue, false];
  }
  if (!names || names.length == 0) {
    return [toml, true];
  }
  const res = names.reduce((o, n) => (!o || Array.isArray(o) ? undefined : o[n]), toml);
  return res && Array.isArray(defaultValue) == Array.isArray(res) ? [res as T, true] : [defaultValue, false];
};
