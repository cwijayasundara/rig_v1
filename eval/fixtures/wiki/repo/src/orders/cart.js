export const total = lines => lines.reduce((sum, l) => sum + l.cents * l.qty, 0)
