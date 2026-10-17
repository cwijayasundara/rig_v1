const optedOut = new Set()
export const setMarketingOptOut = id => optedOut.add(id)
export const isOptedOut = id => optedOut.has(id)
