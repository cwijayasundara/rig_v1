export function fail(res, status, code, message) {
  res.status(status).json({ code, message })
}
