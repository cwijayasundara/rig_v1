// After a person approves chart-N on its rig/chart-N branch, every intent starts from the trunk, so the chart has to land there first
// (shop_app 2026-10-27: a change cut from an unmerged chart branch shipped the chart with it; 2026-11-22 rig_v1_test: no step merged it).
// A repo with no origin has no PR to merge it through: the approval merges it locally. With a remote, a person merges the chart PR.
import { git } from './core.ts'

type ChartMerge = { merged: true } | { merged: false; next: string }

export function landChart(branch: string, trunk: string): ChartMerge {
  if (git(['remote', 'get-url', 'origin']) !== null) return { merged: false, next: `push ${branch}, open its PR and merge it into ${trunk}, then start from ${trunk} with ` }
  const by = (why: string): ChartMerge => ({ merged: false, next: `${why}: merge ${branch} into ${trunk} yourself (git checkout ${trunk} && git merge --no-ff ${branch}), then start from ${trunk} with ` })
  if ((git(['status', '--porcelain', '--untracked-files=no']) ?? 'x') !== '') return by('uncommitted changes, so the chart was not merged')
  if (git(['checkout', '-q', trunk]) === null) return by(`could not check out ${trunk}`)
  if (git(['merge', '-q', '--no-ff', '-m', `Merge ${branch}: approved chart`, branch]) === null) {
    git(['merge', '--abort']); git(['checkout', '-q', branch])
    return by('the merge did not apply cleanly')
  }
  return { merged: true }
}
