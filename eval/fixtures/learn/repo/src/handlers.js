const items = new Map()

export function addItem(req, res) {
  if (!req.body?.id) return res.status(400).send('an item needs an id')
  items.set(req.body.id, req.body)
  res.status(201).json(req.body)
}

export function getItem(req, res) {
  const item = items.get(req.params.id)
  if (!item) return res.status(404).send('no such item')
  res.json(item)
}
