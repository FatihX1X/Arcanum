export const rpcProxyBodyLimit = 256 * 1024;

export function rpcProxyPath(chainId: number) {
  return `/api/rpc/${chainId}`;
}

export function rpcTransportUrl(chainId: number, directRpcUrl: string) {
  return typeof window === 'undefined' ? directRpcUrl : rpcProxyPath(chainId);
}

export function isSafeJsonRpcPayload(value: unknown) {
  const requests = Array.isArray(value) ? value : [value];
  return requests.length > 0 && requests.length <= 50 && requests.every((request) => {
    if (!request || typeof request !== 'object') return false;
    const method = (request as { method?: unknown }).method;
    return typeof method === 'string'
      && /^(eth_|net_version$|web3_clientVersion$)/.test(method);
  });
}
