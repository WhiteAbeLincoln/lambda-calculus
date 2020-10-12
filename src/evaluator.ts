import { Binding, Context, ctxlength } from './context'
import {
  AbstractionNode,
  ApplicationNode,
  Term,
  termWalk,
} from './parser'
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

type StackFrame =
  | { kind: 'appleft'; term: ApplicationNode }
  | { kind: 'appright'; term: ApplicationNode }

type Stack = StackFrame[]
function consumeStack(
  stack: Stack,
  value: Term | undefined,
): Term | undefined {
  while (stack.length !== 0) {
    const frame = stack.pop()!
    switch (frame.kind) {
      case 'appleft': {
        value = value && { ...frame.term, left: value }
        break
      }
      case 'appright': {
        value = value && { ...frame.term, right: value }
        break
      }
    }
  }
  return value
}

const eval1 = (
  ctx: Context,
  initTerm: Term,
  initStack: Stack = [],
): Term | undefined => {
  const evalStack: Array<{ t: Term, stk: Stack }> = []
  evalStack.push({ t: initTerm, stk: initStack })
  let result: Term | undefined = undefined

  while (evalStack.length !== 0) {
    const { t, stk } = evalStack.pop()!
    switch (t.kind) {
      case 'var': {
        const { idx, info } = t
        const binding = errorOnUndef(
          info,
          `Variable lookup failure: offset ${idx}, ctx size: ${ctxlength(ctx)}`,
          getbinding(ctx, idx),
        )
        result = consumeStack(stk, binding.kind === 'var' ? binding.term : undefined)
        continue
      }
      case 'app': {
        if (t.left.kind === 'abs' && isval(ctx, t.right)) {
          result = consumeStack(stk, termSubstTop(t.right)(t.left.term))
          continue
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
            // will only stack overflow if we have a lot of builtins referencing each other
            // very unlikely
            const right = evaluate(ctx, t.right)
            result = consumeStack(stk, binding.handler(right, ctx) ?? t.right)
            continue
          }
        }
        if (isval(ctx, t.left)) {
          evalStack.push({ t: t.right, stk: [...stk, { kind: 'appright', term: t }] })
        } else {
          evalStack.push({ t: t.left, stk: [...stk, { kind: 'appleft', term: t }] })
        }
        continue
      }
      default: {
        result = consumeStack(stk, undefined)
        continue
      }
    }
  }

  return result
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
