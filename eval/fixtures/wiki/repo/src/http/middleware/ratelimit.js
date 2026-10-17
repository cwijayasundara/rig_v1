const hits = new Map()
export const throttleByIp = (req, next) => {
  const n = (hits.get(req.ip) ?? 0) + 1
  hits.set(req.ip, n)
  return n > 100 ? { status: 429 } : next(req)
}
