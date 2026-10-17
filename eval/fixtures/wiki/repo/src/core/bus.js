const handlers = new Map()
export const bus = {
  on(event, fn) { handlers.set(event, [...(handlers.get(event) ?? []), fn]) },
  emit(event, payload) { for (const fn of handlers.get(event) ?? []) fn(payload) },
}
