import { fail } from './respond.js'

const items = new Map()

export function addItem(req, res) {
  if (!req.body?.id) return fail(res, 400, 'missing-id', 'an item needs an id')
  items.set(req.body.id, req.body)
  res.status(201).json(req.body)
}

export function getItem(req, res) {
  const item = items.get(req.params.id)
  if (!item) return fail(res, 404, 'not-found', 'no such item')
  res.json(item)
}
