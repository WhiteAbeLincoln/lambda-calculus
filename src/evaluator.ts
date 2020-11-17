import { Binding, Context, ctxlength, index2binding } from './context'
import {
  AbstractionNode,
  ApplicationNode,
  Term,
  VariableNode,
} from './parser/term'
import { shiftForCtx, termShift, termSubstTop } from './shift'
import { errorOnUndef } from './support'
import { printer } from './printer'

export const bindingShift = (d: number) => (b: Binding): Binding =>
  b.kind === 'name'
    ? b
    : b.kind === 'var'
    ? { ...b, term: termShift(d)(b.term) }
    : b
export const getbinding = (ctx: Context, idx: number) => {
  const bind = index2binding(ctx, idx)
  return bind && ([bind[0], bindingShift(idx + 1)(bind[1])] as const)
}

const isval = (_ctx: Context, t: Term): t is AbstractionNode => t.kind === 'abs'

const getBindingForVar = (ctx: Context, term: VariableNode) => {
  const { idx, info } = term
  return errorOnUndef(
    info,
    `Variable lookup failure: offset ${idx}, ctx size: ${ctxlength(ctx)}`,
    getbinding(ctx, idx),
  )
}

export const evaluate = (initCtx: Context, initTerm: Term) => {
  const print: typeof printer = (...args) => printer(...args)
  type StackFrame =
    | { kind: 'appleft'; t: ApplicationNode }
    | { kind: 'appright'; t: ApplicationNode }

  let term = initTerm
  let ctx = initCtx
  let r: Term | undefined = undefined
  do {
    const evalstack: Term[] = [term]
    const stack: StackFrame[] = []
    while (evalstack.length !== 0) {
      const term = evalstack.pop()!
      switch (term.kind) {
        case 'var': {
          const binding = getBindingForVar(ctx, term)
          const v =
            binding[1].kind === 'var'
              ? ({ ...binding[1].term, bindingname: binding[0] } as Term)
              : undefined
          r = consumeStack(stack, v)
          continue
        }
        case 'app': {
          if (term.left.kind === 'abs' && isval(ctx, term.right)) {
            const v = termSubstTop(term.right, term.left.term)
            r = consumeStack(
              stack,
              v && { ...v, bindingname: term.bindingname },
            )
            continue
          }
          if (isval(ctx, term.left)) {
            stack.push({ kind: 'appright', t: term })
            evalstack.push(term.right)
            continue
          }
          // handle builtin bindings
          if (term.left.kind === 'var') {
            const binding = getBindingForVar(ctx, term.left)
            if (binding[1].kind === 'builtin') {
              const right = evaluate(ctx, term.right)
              const bindres = binding[1].handler(right, ctx)
              if (!bindres) {
                r = consumeStack(stack, term.right)
              } else {
                // if context changes, we need to perform a shift
                // assume we always change context by adding or removing from
                // front. if diff is positive that means we added, and need to
                // shift all indexes past diff - 1
                // if diff is negative, then we shift all indexes from 0 up
                const mapper = shiftForCtx(ctx, bindres[0])
                // we assume the term returned by the handler is already
                // correct relative to the new context. Just map any pending
                // terms in the stack
                // TODO: should we also map evalstack?
                r = consumeStack(
                  stack.map((s): typeof s => ({
                    ...s,
                    t: mapper(s.t) as typeof s.t,
                  })),
                  bindres[1],
                )
                ctx = bindres[0]
              }
              continue
            }
          }
          stack.push({ kind: 'appleft', t: term })
          evalstack.push(term.left)
          continue
        }
        default: {
          r = consumeStack(stack, undefined)
          continue
        }
      }
    }
    if (r !== undefined) {
      term = r
    }
  } while (r !== undefined)
  return term

  function consumeStack(stack: StackFrame[], v: Term | undefined): Term | undefined {
    while (stack.length !== 0) {
      const c = stack.pop()!
      switch (c.kind) {
        case 'appleft': {
          v = v && { ...c.t, left: v }
          break
        }
        case 'appright': {
          v = v && { ...c.t, right: v }
          break
        }
      }
    }
    return v
  }
}
