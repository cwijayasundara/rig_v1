// Hidden acceptance over HTTP: starts the repo's `npm start` on a free port and checks the brief's promises with requests only,
// so it holds for any language or layout. Nothing under src/ is imported. `remove` re-checks `shop` first, on a fresh server.
import fs from 'node:fs'
import path from 'node:path'
import { start, stop, request } from '../fixtures/tooling/scripts/contract.mjs'

const call = port => (method, p, body) => request(port, method, p, body)

const PROMISES = {
  async shop(req, repo) {
    if ((await req('POST', '/checkout', {})).status !== 400) return 'checkout of an empty cart was not 400'
    const products = await req('GET', '/products')
    if (products.status !== 200 || !['TEA-001', 'MUG-002'].every(s => products.body?.some?.(p => p.sku === s))) return `GET /products: ${products.status} ${JSON.stringify(products.body)}`
    if ((await req('POST', '/cart', { sku: 'TEA-001', qty: 2 })).status !== 201) return 'POST /cart TEA-001 x2 not 201'
    if ((await req('POST', '/cart', { sku: 'MUG-002', qty: 1 })).status !== 201) return 'POST /cart MUG-002 not 201'
    if ((await req('POST', '/cart', { sku: 'NOPE-999' })).status !== 400) return 'unknown SKU not 400'
    if ((await req('POST', '/checkout', { code: 'FREE' })).status !== 400) return 'unknown discount code not 400'
    const paid = await req('POST', '/checkout', { code: 'SAVE10' })
    if (paid.status !== 201 || paid.body?.totalCents !== 1890) return `SAVE10 on 2100: ${paid.status} ${JSON.stringify(paid.body)}, want total 1890`
    if ((await req('GET', '/nope')).status !== 404) return 'unknown path not 404'
    const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'))
    return !Object.keys(pkg.dependencies ?? {}).length || 'runtime dependencies declared'
  },
  async remove(req) {
    await req('POST', '/cart', { sku: 'TEA-001', qty: 2 })
    await req('POST', '/cart', { sku: 'MUG-002', qty: 1 })
    const del = await req('DELETE', '/cart/TEA-001')
    if (del.status !== 200 || del.body?.length !== 1) return `DELETE /cart/TEA-001: ${del.status} ${JSON.stringify(del.body)}`
    if ((await req('DELETE', '/cart/TEA-001')).status !== 400) return 'DELETE of an absent SKU not 400'
    const paid = await req('POST', '/checkout', {})
    return paid.body?.totalCents === 1200 || `checkout after delete: ${JSON.stringify(paid.body)}, want total 1200`
  },
}

export async function assertShopHttp(c, repo, phase) {
  if (!PROMISES[phase]) throw new Error(`unknown shop phase: ${phase}`)
  await c.check(`hidden acceptance over HTTP: ${phase}`, async () => {
    for (const p of phase === 'remove' ? ['shop', 'remove'] : ['shop']) {
      const { child, port } = await start(repo)
      try {
        const r = await PROMISES[p](call(port), repo)
        if (r !== true) return `${p}: ${r}`
      } finally {
        await stop(child)
      }
    }
    return true
  })
}
