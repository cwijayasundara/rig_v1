const live = new Set(['demo'])
export const isValid = token => live.has(token)
