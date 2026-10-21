// The HTTP face of the shop: the same handler over node:http. PORT=0 picks a free port; it prints `listening on <port>`.
import http from 'node:http'
import { handle } from './shop.js'

const server = http.createServer((req, res) => {
  let raw = ''
  req.on('data', c => { raw += c })
  req.on('end', () => {
    const out = handle({ method: req.method, path: req.url, body: raw ? JSON.parse(raw) : {} })
    res.writeHead(out.status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(out.body))
  })
})
server.listen(Number(process.env.PORT ?? 0), () => console.log(`listening on ${server.address().port}`))
