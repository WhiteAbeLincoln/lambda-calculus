/**
 * 1. Define a function removenames(Γ, t) that takes a naming context Γ and
 *    an ordinary term t (with FV(t) \subseteq dom(Γ)) and yields the
 *    corresponding nameless term.
 * 2. Define a function restorenames(Γ, t) that takes a nameless term t and
 *    a naming context Γ and produces an ordinary term. (To do this, you will
 *    need to "make up" names for the variables bound by abstractions in t.
 *    You may assume that the names in Γ are pairwise distinct and that the set
 *    V of variable names is ordered, so that it makes sens to say "choose the
 *    first variable name that is not already in dom(Γ).")
 *
 * The pair of functions should have the property that
 * remove(restore(t)) = t
 * restore(remove(t)) = t
 * up to renaming of bound variables, for any ordinary term t.
 */

import { TreeTerm, match, printTree } from './NamelessTree'

type NamingContext = Array<string>

type VarTerm = { kind: 'var', name: string }
type AppTerm = { kind: 'app', left: Term, right: Term }
type AbsTerm = { kind: 'abs', term: Term, var: VarTerm }
type Term = VarTerm | AppTerm | AbsTerm

const printer = (ctx: NamingContext) => (t: Term): string => {
  switch (t.kind) {
    case 'abs': {
      const { term, var: { name } } = t
      return `(\\${name}. ${printer(ctx)(term)})`
    }
    case 'app': {
      const { left, right } = t
      return `(${printer(ctx)(left)} ${printer(ctx)(right)})`
    }
    case 'var': {
      return t.name
    }
  }
}

/** The set of free variables of a term t, written FV(t) is defined as:
 *
 * FV(x) = {x}
 *
 * FV(\x.t1) = FV(t1) \ {x}
 *
 * FV(t1 t2) = FV(t1) U FV(t2)
 */
const getFreeVariables = (term: Term): Array<string> => {
  switch (term.kind) {
    case 'var': {
      return [term.name]
    }
    case 'abs': {
      return getFreeVariables(term.term).filter(v => v !== term.var.name)
    }
    case 'app': {
      return [
        ...new Set([
          ...getFreeVariables(term.left),
          ...getFreeVariables(term.right),
        ]),
      ]
    }
    default:
      return term
  }
}

const subseteq = <T>(x: T[], y: T[]) => {
  if (x.length > y.length) return false
  for (const v of x) {
    if (!y.includes(v)) return false
  }
  return true
}

function createName(taken: string[]) {
  let n = 0
  while (taken.includes(`v${n}`)) {
    n++
  }
  return `v${n}`
}

const removenames = (nc: NamingContext) => (term: Term): TreeTerm => {
  // we need a consistency check that FV(t) <= dom(T)
  if (!subseteq(getFreeVariables(term), nc))
    throw new Error(
      'Free Variables of term is not a subset of the naming context',
    )

  // for every free variable, we must replace it with something from the naming context
  switch (term.kind) {
    case 'var': {
      // we find the index first bound variable - so in the case of \x.x,
      // boundVariables will equal ['x'] when evaluating the term x
      const name = term.name
      let idx = nc.findIndex(b => b === name)
      if (idx === -1) throw new Error(`${name} not found in naming context`)

      return idx
    }
    case 'abs': {
      // we always push new bound variables to the front of the list
      // since debruijn refers to the nearest enclosing abstraction outwards
      const name = term.var.name
      if (!name) throw new Error('Binding variable in abstraction has no name')
      return [removenames([name, ...nc])(term.term)]
    }
    case 'app': {
      return [removenames(nc)(term.left), removenames(nc)(term.right)]
    }
  }
}

const restorenames = (nc: NamingContext): ((t: TreeTerm) => Term) =>
  match(
    idx => {
      // we have a nameless variable. first find a name from the boundVariables set
      // then default to the naming context
      const name = nc[idx]
      if (!name) throw new Error('Failed to find a name for variable')
      return {
        kind: 'var',
        name,
      } as Term
    },
    term => {
      // we make up a name. We just need to pick a name that doesn't already exist in boundVariables
      // or the naming context. we do this by prefixing the name with x, then appending its index
      const name = createName(nc)
      return {
        kind: 'abs',
        var: { kind: 'var', name },
        term: restorenames([name, ...nc])(term),
      }
    },
    (left, right) => {
      return {
        kind: 'app',
        right: restorenames(nc)(right),
        left: restorenames(nc)(left),
      }
    },
  )

/** Examples taken from exercise 6.1.1, and results verified using back of the book */
const Id: TreeTerm = [0]
const C0: TreeTerm = [[0]]
const C1: TreeTerm = [[[1, [1, 0]]]]
const Plus: TreeTerm = [
  [
    [
      [
        [
          [3, 1],
          [[2, 0], 1],
        ],
      ],
    ],
  ],
]
const Foo: TreeTerm = [[[0]], [0]]

const remove = removenames([])
const restore = restorenames([])
for (const l of [Id, C0, C1, Plus, Foo]) {
  console.log(
    `${printTree(l)}\n\t${printer([])(restore(l))}\n\t${printTree(
      remove(restore(l)),
    )}\n\n`,
  )
}
