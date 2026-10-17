export const quote = (address, speed) => (speed === 'express' ? 2500 : 500) + (address.country === 'US' ? 0 : 1500)
