import { Binding, Context, ctxlength } from './context'
import { AbstractionNode, Command, Term, termWalk } from './parser'
import { printer } from './printer'
import { errorOnUndef } from './support'

// shifting
export const termShiftAbove = (d: number) =>
  termWalk((v, c) =>
    v.idx >= c
      ? { ...v, idx: v.idx + d, depth: v.depth + d }
      : { ...v, depth: v.depth + d },
  )

export const termShift = (d: number) => termShiftAbove(d)(0)
export const bindingShift = (d: number) => (b: Binding): Binding =>
  b.kind === 'name'
    ? b
    : b.kind === 'var'
    ? { ...b, term: termShift(d)(b.term) }
    : b

// substitution
export const termSubst = (j: number) => (s: Term) =>
  termWalk((v, c) => (v.idx === j + c ? termShift(c)(s) : v))(0)

export const termSubstTop = (s: Term) => (t: Term) =>
  termShift(-1)(termSubst(0)(termShift(1)(s))(t))

export const getbinding = (ctx: Context, idx: number): Binding | undefined => {
  const bind = ctx[idx]?.[1] as Binding | undefined
  return bind && bindingShift(idx + 1)(bind)
}

const isval = (_ctx: Context, t: Term): t is AbstractionNode => t.kind === 'abs'

const eval1 = (ctx: Context, t: Term): Term | undefined => {
  switch (t.kind) {
    case 'var': {
      const { idx, info } = t
      const binding = errorOnUndef(
        info,
        `Variable lookup failure: offset ${idx}, ctx size: ${ctxlength(ctx)}`,
        getbinding(ctx, idx),
      )
      if (binding.kind === 'var') {
        return binding.term
      }
      return undefined
    }
    case 'app': {
      if (t.left.kind === 'abs' && isval(ctx, t.right)) {
        return termSubstTop(t.right)(t.left.term)
      }
      // handle builtin bindings
      if (t.left.kind === 'var') {
        const { idx, info } = t.left
        const binding = errorOnUndef(
          info,
          `Variable lookup failure: offset ${idx}, ctx size: ${ctxlength(ctx)}`,
          getbinding(ctx, idx),
        )
        if (binding.kind === 'builtin') {
          const right = evaluate(ctx, t.right)
          return binding.handler(right, ctx) ?? t.right
        }
      }
      if (isval(ctx, t.left)) {
        const t2 = eval1(ctx, t.right)
        return t2 && { ...t, right: t2 }
      }
      const t1 = eval1(ctx, t.left)
      return t1 && { ...t, left: t1 }
    }
    default: {
      return undefined
    }
  }
}

export const evaluate = (ctx: Context, t: Term): Term => {
  let oldt = t
  let t1: Term | undefined = undefined
  do {
    t1 = eval1(ctx, oldt)
    if (t1 !== undefined) oldt = t1
  } while (t1 !== undefined)
  return oldt
}
