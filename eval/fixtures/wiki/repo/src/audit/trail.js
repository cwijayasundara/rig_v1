const log = []
export const record = (event, payload) => log.push({ event, payload, at: Date.now() })
export const history = () => [...log]
