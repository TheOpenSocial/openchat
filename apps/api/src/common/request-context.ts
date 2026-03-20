import { AsyncLocalStorage } from "node:async_hooks";

interface RequestContext {
  traceId: string;
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, fn: () => T) {
  return requestContextStorage.run(context, fn);
}

export function getRequestTraceId() {
  return requestContextStorage.getStore()?.traceId ?? null;
}
