// The route table. Every route added after the orders API is registered here, and src/http/handler.js dispatches from this table
// before anything else: a handler that is not listed here is never reached, and its path answers 404 over HTTP.
// An entry is { method, path: RegExp, handle(ctx) }. ctx is { method, url, params, headers, body, catalog, problem, json }, where params
// are the regexp's capture groups, and handle returns { status, body, headers } (a string body is sent as is).
export const routes = []
