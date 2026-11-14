// Money for display: amounts are in dollars and are shown with two decimals, rounded half up to the cent.
export const dollars = amount => {
  const cents = Math.floor(Math.round(amount * 1e6) / 1e4 + 0.5)
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}
