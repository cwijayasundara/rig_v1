export async function withBackoff(fn, tries = 3) {
  for (let i = 0; ; i++) {
    try { return await fn() } catch (err) { if (i >= tries - 1) throw err; await new Promise(r => setTimeout(r, 2 ** i * 100)) }
  }
}
