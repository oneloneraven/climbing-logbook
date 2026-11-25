export const APP_VERSION = /^(v\d+\.\d+\.\d+|dev)$/;

export const validAppVersion = value => (typeof value === "string" && APP_VERSION.test(value) ? value : undefined);

// Every link to the report and feedback forms goes through this, so each report says which build it came from.
export function withAppVersion(url, version) {
  const valid = validAppVersion(version);
  if (!valid) return url;
  const [base, query = ""] = url.split("?");
  const params = new URLSearchParams(query);
  params.set("version", valid);
  return `${base}?${params}`;
}
