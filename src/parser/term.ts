import { Token } from '../scanner'
import { dummyinfo, Info } from '../support'

type NodeKind = 'var' | 'abs' | 'app'

export interface Node {
  kind: NodeKind
  tokens?: Token[]
  info: Info
}

export interface VariableNode extends Node {
  kind: 'var'
  /** de Bruijn index */
  idx: number
  /** contains the total length of the ctx in which var occurs */
  depth: number
  /** lets us skip the depth consistency check */
  synthetic?: boolean
  /** used by the evaluator to give hints to the printer */
  bindingname?: string
}

export interface AbstractionNode extends Node {
  kind: 'abs'
  term: Term
  varname?: string
  /** used by the evaluator to give hints to the printer */
  bindingname?: string
}

export interface ApplicationNode extends Node {
  kind: 'app'
  left: Term
  right: Term
  /** used by the evaluator to give hints to the printer */
  bindingname?: string
}

export type Term = VariableNode | AbstractionNode | ApplicationNode

// export const abs = (vars: string[]): AbstractionNode => {}

/** Maps over the abstract syntax tree of terms */
export const termWalk = (fn: (v: VariableNode, depth: number) => Term) => (
  startDepth = 0,
) => (initTerm: Term): Term => {
  const stack: Array<{ c: number; t: Term }> = []
  const term = { ...initTerm }
  stack.push({ c: startDepth, t: term })

  while (stack.length !== 0) {
    const { c, t } = stack.pop()!
    switch (t.kind) {
      case 'var': {
        const s = { ...fn(t, c) }
        // we have to keep the same reference
        for (const key in t) {
          if (t.hasOwnProperty(key)) {
            delete (t as any)[key]
          }
        }
        Object.assign(t, s)
        break
      }
      case 'abs': {
        const term = { ...t.term }
        t.term = term
        stack.push({ c: c + 1, t: term })
        break
      }
      case 'app': {
        const left = { ...t.left }
        const right = { ...t.right }
        t.left = left
        t.right = right
        stack.push({ c, t: left })
        stack.push({ c, t: right })
        break
      }
    }
  }
  return term
}

/**
 * two ordinary terms are equivalent modulo renaming of bound variables iff they
 * have the same de Bruijn representation
 */
export const termEq = (initX: Term, initY: Term): boolean => {
  const stack: Array<{ x: Term; y: Term }> = [{ x: initX, y: initY }]
  while (stack.length !== 0) {
    const { x, y } = stack.pop()!
    if (x.kind !== y.kind) return false
    switch (x.kind) {
      case 'abs': {
        stack.push({ x: x.term, y: (y as AbstractionNode).term })
        break
      }
      case 'app': {
        stack.push(
          { x: x.left, y: (y as ApplicationNode).left },
          { x: x.right, y: (y as ApplicationNode).right },
        )
        break
      }
      case 'var': {
        if (x.idx !== (y as VariableNode).idx) return false
        break
      }
    }
  }
  return true
}

export const variable = (idx: number): VariableNode => ({
  kind: 'var',
  idx,
  depth: 0,
  synthetic: true,
  info: dummyinfo,
})

const getTerm = (t: Term | number) => (typeof t === 'number' ? variable(t) : t)

export const abs = (term: Term | number): AbstractionNode => ({
  kind: 'abs',
  term: getTerm(term),
  info: dummyinfo,
})

export const app = (
  ...terms: [Term | number, Term | number, ...(Term | number)[]]
): ApplicationNode => {
  const [left, right, ...rest] = terms
  let lapp: Term = {
    kind: 'app',
    left: getTerm(left),
    right: getTerm(right),
    info: dummyinfo,
  }
  while (rest.length !== 0) {
    const right = rest.pop()!
    lapp = { kind: 'app', left: lapp, right: getTerm(right), info: dummyinfo }
  }
  return lapp
}
