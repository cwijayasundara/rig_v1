import { isValid } from '../../users/session.js'
export const requireSession = (req, next) => (isValid(req.token) ? next(req) : { status: 401 })
