// The HTTP entry point (B4): serves createHandler over node:http on $PORT (0 picks a free port) with the seeded catalog.
import http from 'node:http'
import { Catalog } from './catalog/products.js'
import { createHandler } from './http/handler.js'

const catalog = new Catalog()
catalog.add({ sku: 'TEA-001', name: 'Green tea', priceCents: 450 })
catalog.add({ sku: 'MUG-002', name: 'Mug', priceCents: 1200 })
const handle = createHandler(catalog)

const server = http.createServer((req, res) => {
  let data = ''
  req.on('data', chunk => { data += chunk })
  req.on('end', () => {
    let body
    try { body = data ? JSON.parse(data) : {} } catch { body = null }
    const r = body === null ? { status: 400, body: { error: 'invalid JSON' } } : handle({ method: req.method, path: req.url, body, headers: req.headers })
    res.writeHead(r.status, { 'content-type': 'application/json', ...r.headers })
    res.end(r.body === undefined ? undefined : JSON.stringify(r.body))
  })
})
server.listen(Number(process.env.PORT ?? 3000), () => console.log(`listening on ${server.address().port}`))
