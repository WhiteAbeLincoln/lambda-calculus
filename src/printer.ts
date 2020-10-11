import { ctxlength, index2name, Context, isnamebound, addname } from './context'
import { Term } from './parser'
import { errorOnUndef, InternalError } from './support'

const pickfreshname = (
  ctx: Context,
  name?: string,
): [ctx: Context, name: string] => {
  const orig = name || 'v'
  let n = orig
  let i = 0
  while (isnamebound(ctx, n)) {
    i++
    n = `${orig}${i}`
  }
  return [addname(ctx, n), n]
}

export const printer = (ctx: Context) => (t: Term): string => {
  switch (t.kind) {
    case 'abs': {
      const { term, varname } = t
      const [ctx1, n] = pickfreshname(ctx, varname)
      return `\\${n}. ${printer(ctx1)(term)}`
    }
    case 'app': {
      const { left, right } = t
      const showLeft = (t: Term) => t.kind === 'abs' ? `(${printer(ctx)(t)})` : printer(ctx)(t)
      const showRight = (t: Term) => t.kind === 'var' ? `${printer(ctx)(t)}` : `(${printer(ctx)(t)})`
      return `${showLeft(left)} ${showRight(right)}`
    }
    case 'var': {
      const { depth, idx } = t
      if (ctxlength(ctx) === depth)
        return errorOnUndef(
          t.info,
          `Variable lookup failure: offset: ${idx}, ctx size ${ctxlength(ctx)}`,
          index2name(ctx, idx),
        )
      throw new InternalError(
        t.info,
        `Bad index: ${idx}/${depth} in {${ctx.map(([n]) => n).join(' ')}}`,
      )
    }
  }
}
