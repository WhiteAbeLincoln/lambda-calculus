import {
  ctxlength,
  index2name,
  Context,
  pickfreshname,
} from './context'
import { Term } from './parser/term'
import { errorOnUndef, InternalError } from './support'

const getExisting = (t: Term, useHint: boolean) => {
  const existing = t.bindingname
  return useHint ? existing : undefined
}
const canShowWithoutParen = (
  t: Term,
  useHint: boolean,
  rightTerm?: Term,
) =>
  t.kind === 'var' ||
  getExisting(t, useHint) ||
  (t.kind === 'app' && rightTerm)
export const printer = (ctx: Context, t: Term, useHint = true): string => {
  switch (t.kind) {
    case 'abs': {
      const existing = getExisting(t, useHint)
      if (existing) return existing

      const { term, varname } = t
      const [ctx1, n] = pickfreshname(ctx, varname)
      return `\\${n}. ${printer(ctx1, term, useHint)}`
    }
    case 'app': {
      const { left, right } = t
      const showTerm = (t: Term, rightTerm?: Term) =>
        canShowWithoutParen(t, useHint, rightTerm)
          ? printer(ctx, t, useHint)
          : `(${printer(ctx, t, useHint)})`
      return `${showTerm(left, right)} ${showTerm(right)}`
    }
    case 'var': {
      const existing = getExisting(t, useHint)
      if (existing) return existing

      const { depth, idx, synthetic } = t
      if (ctxlength(ctx) === depth || synthetic)
        return errorOnUndef(
          t.info,
          `Variable lookup failure: offset: ${idx}, ctx size ${ctxlength(ctx)}`,
          index2name(ctx, idx),
        )
      throw new InternalError(
        t.info,
        `Bad index: ${idx}/${depth} in {${ctx.bindings
          .map(([n]) => n)
          .join(' ')}}`,
      )
    }
  }
}
