import { verify } from '../lib.mjs'

await verify('shop', async ({ launch, step }) => {
  const app = await launch('node src/server.js')
  console.log(`server pid ${app.pid}`)
  const call = async (method, path, body) => {
    const res = await fetch(app.url + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    return { status: res.status, body: await res.json() }
  }
  await step('a shopper sees the products', async () => { const r = await call('GET', '/products'); if (r.status !== 200 || r.body.length !== 2) throw new Error(`GET /products: ${r.status} ${JSON.stringify(r.body)}`) })
  await step('a shopper adds tea to the cart', async () => { const r = await call('POST', '/cart', { sku: 'TEA-001', qty: 2 }); if (r.status !== 201) throw new Error(`POST /cart: ${r.status} ${JSON.stringify(r.body)}`) })
  await step('the checkout totals what was added', async () => { const r = await call('POST', '/checkout'); if (r.status !== 201 || r.body.totalCents !== 900) throw new Error(`POST /checkout: ${r.status} ${JSON.stringify(r.body)}, want total 900`) })
})
