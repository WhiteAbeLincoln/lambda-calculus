import {
  addname,
  Context,
  ctxlength,
  emptycontext,
  index2name,
  name2index,
  pickfreshname,
} from '../context'
import { dummyinfo } from '../support'
import { UnionToIntersection } from '../util'
import type { Term } from './term'

export type NamedAbs = { kind: 'abs'; variable: NamedVar; body: NamedTerm }
export type NamedApp = { kind: 'app'; left: NamedTerm; right: NamedTerm }
export type NamedVar = { kind: 'var'; name: string }
export type NamedTerm = NamedAbs | NamedApp | NamedVar

export const getFreeVariables = (initTerm: NamedTerm): string[] => {
  type StackFrame =
    | { kind: 'abs'; bound: string }
    | { kind: 'appl'; right: NamedTerm }
    | { kind: 'appr'; left: string[] }
  type Stack = StackFrame[]

  const evalStack: Array<{ term: NamedTerm; stack: Stack }> = [
    { term: initTerm, stack: [] },
  ]
  let result: string[] = []
  loop: while (evalStack.length !== 0) {
    const { term, stack } = evalStack.pop()!
    switch (term.kind) {
      case 'var': {
        result = [term.name]
        while (stack.length !== 0) {
          const frame = stack.pop()!
          switch (frame.kind) {
            case 'abs': {
              result = result.filter(x => x !== frame.bound)
              break
            }
            case 'appl': {
              stack.push({ kind: 'appr', left: result })
              evalStack.push({ term: frame.right, stack })
              continue loop
            }
            case 'appr': {
              result = [...new Set([...result, ...frame.left])]
            }
          }
        }

        continue
      }
      case 'abs': {
        evalStack.push({
          term: term.body,
          stack: [...stack, { kind: 'abs', bound: term.variable.name }],
        })
        continue
      }
      case 'app': {
        evalStack.push({
          term: term.left,
          stack: [...stack, { kind: 'appl', right: term.right }],
        })
        continue
      }
    }
  }
  return result
}

const subseteq = <T>(x: T[], y: T[]) => {
  if (x.length > y.length) return false
  for (const v of x) {
    if (!y.includes(v)) return false
  }
  return true
}

/**
 * converts from a named term to a nameless debruijn term
 * @param ctx context
 * @param term term
 */
export const toTerm = (
  initTerm: NamedTerm,
  ctx: Context = emptycontext(),
): Term => {
  type StackFrame =
    | { kind: 'abs'; name: string }
    | { kind: 'appr'; left: Term }
    | { kind: 'appl'; right: NamedTerm }
  const stack: StackFrame[] = []
  const evalStack: NamedTerm[] = [initTerm]
  let ret: Term | undefined
  loop: while (evalStack.length !== 0) {
    const term = evalStack.pop()!
    if (
      !subseteq(
        getFreeVariables(term),
        ctx.bindings.map(v => v[0]),
      )
    ) {
      throw new Error(
        'Free Variables of term is not a subset of the naming context',
      )
    }

    switch (term.kind) {
      case 'var': {
        const name = term.name
        let idx = name2index(ctx, name)
        if (idx === undefined)
          throw new Error(`${name} not found in naming context`)

        ret = {
          kind: 'var',
          idx,
          depth: ctxlength(ctx),
          info: dummyinfo,
          synthetic: true,
        }
        while (stack.length !== 0) {
          const cont = stack.pop()!
          switch (cont.kind) {
            case 'abs': {
              ret = ret && {
                kind: 'abs',
                varname: cont.name,
                term: ret,
                info: dummyinfo,
              }
              break
            }
            case 'appl': {
              evalStack.push(cont.right)
              stack.push({ kind: 'appr', left: ret })
              continue loop
            }
            case 'appr': {
              ret = ret && {
                kind: 'app',
                left: cont.left,
                right: ret,
                info: dummyinfo,
              }
              break
            }
          }
        }
        continue
      }
      case 'abs': {
        const name = term.variable.name
        if (!name)
          throw new Error('Binding variable in abstraction has no name')
        ctx = addname(ctx, name)
        stack.push({ kind: 'abs', name })
        evalStack.push(term.body)
        continue
      }
      case 'app': {
        stack.push({ kind: 'appl', right: term.right })
        evalStack.push(term.left)
        continue
      }
    }
  }

  return ret!
}

export const fromTerm = (
  term: Term,
  ctx: Context = emptycontext(),
): NamedTerm => {
  switch (term.kind) {
    case 'var': {
      const { idx } = term
      const name = index2name(ctx, idx)
      if (!name) throw new Error('Failed to find name for variable')
      return { kind: 'var', name }
    }
    case 'abs': {
      const [newctx, name] = pickfreshname(ctx)
      return {
        kind: 'abs',
        variable: { kind: 'var', name },
        body: fromTerm(term.term, newctx),
      }
    }
    case 'app': {
      return {
        kind: 'app',
        right: fromTerm(term.right, ctx),
        left: fromTerm(term.left, ctx),
      }
    }
  }
}

export const abs = <
  Vars extends [string, ...string[]],
  BoundV extends UnionToIntersection<
    { [k in keyof Vars]: { [v in Vars[k] & string]: NamedVar } }[number]
  > = UnionToIntersection<
    { [k in keyof Vars]: { [v in Vars[k] & string]: NamedVar } }[number]
  >
>(
  ...args: [...Vars, (bound: BoundV) => NamedTerm]
): NamedTerm => {
  const name = args[0] as string
  const vars = args.slice(1, args.length - 1) as string[]
  const getBody = args[args.length - 1] as (bound: BoundV) => NamedTerm

  const variable: NamedVar = { kind: 'var', name }
  const bound = vars.reduce((acc, v) => {
    ;(acc as any)[v] = { kind: 'var', name: v }
    return acc
  }, {} as BoundV)
  ;(bound as any)[name] = variable

  return {
    kind: 'abs',
    variable,
    body: vars.reduceRight(
      (body, v): NamedTerm => ({
        kind: 'abs',
        variable: (bound as any)[v],
        body,
      }),
      getBody(bound),
    ),
  }
}

export const nvar = (name: string): NamedVar => ({ kind: 'var', name })

export const app = (
  ...terms: [NamedTerm, NamedTerm, ...NamedTerm[]]
): NamedApp => {
  const [left, right, ...rest] = terms
  let lapp: NamedApp = { kind: 'app', left, right }
  while (rest.length !== 0) {
    const right = rest.pop()!
    lapp = { kind: 'app', left: lapp, right }
  }
  return lapp
}
