import { Context, ctxlength } from './context'
import { Term, termWalk } from './parser/term'

// shifting
export const termShiftAbove = (d: number) =>
  termWalk((v, c) =>
    v.idx >= c
      ? { ...v, idx: v.idx + d, depth: v.depth + d }
      : { ...v, depth: v.depth + d },
  )

export const termShift = (d: number) => termShiftAbove(d)(0)

// substitution
export const termSubst = (j: number, s: Term) =>
  termWalk((v, c) => (v.idx === j + c ? termShift(c)(s) : v))(0)

export const termSubstTop = (s: Term, t: Term) =>
  termShift(-1)(termSubst(0, termShift(1)(s))(t))

export const shiftForCtx = (
  oldCtx: Context,
  newCtx: Context,
): ((t: Term) => Term) => {
  const diff = ctxlength(newCtx) - ctxlength(oldCtx)
  return diff === 0 ? x => x : termShiftAbove(diff)(diff <= 0 ? 0 : diff - 1)
}
