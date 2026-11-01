// The operator plays the merger: push to a fresh ref so pre-push really runs, then fast-forward main.
// A merge on the server also moves origin/main, and rig's verify measures a change's scope against it, so the next change must see it moved:
// the bare origin's main is advanced directly (a server-side merge runs no client hook, so no hook is bypassed) and fetched.
export function mergeToMain(sb, slug) {
  sb.git('push', 'origin', `HEAD:refs/heads/prepush-${slug}`)
  sb.git('checkout', '-q', 'main')
  sb.git('merge', '-q', '--ff-only', `sdlc/${slug}`)
  const sha = sb.git('rev-parse', 'HEAD')
  sb.run('git', ['--git-dir', sb.origin, 'update-ref', 'refs/heads/main', sha])
  sb.git('fetch', '-q', 'origin')
}
