const defaults = { expressShipping: false, loyaltyPoints: true }
export const isEnabled = name => process.env['FLAG_' + name] === '1' || defaults[name] === true
