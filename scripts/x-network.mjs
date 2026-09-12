import { ProxyAgent, fetch as undiciFetch } from "undici";
export function createXNetwork(proxy = "") {
  let agent;
  if (proxy) {
    const u = new URL(proxy);
    if (!["http:", "https:"].includes(u.protocol))
      throw Error("MYLAB_PROXY_URL 需要 HTTP 代理地址");
    agent = new ProxyAgent(u.href);
  }
  return {
    fetch: (url, options = {}) =>
      undiciFetch(url, { ...options, ...(agent ? { dispatcher: agent } : {}) }),
    close: () => agent?.close(),
    proxy: proxy ? new URL(proxy).origin : "",
  };
}
