export function allowedLocalFeed(value, origins) {
  const u = new URL(value);
  return (
    ["http:", "https:"].includes(u.protocol) &&
    ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) &&
    !u.username &&
    !u.password &&
    origins.has(u.origin) &&
    !/%(?:2f|5c|25)/i.test(u.pathname) &&
    /^\/feeds?(?:\/|\.|$)/.test(u.pathname)
  );
}
