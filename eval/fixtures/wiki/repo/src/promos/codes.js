const codes = { SPRING: { rate: 0.1 }, VIP: { rate: 0.2 } }
export const lookup = code => codes[code] ?? null
