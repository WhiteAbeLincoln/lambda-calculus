
/**
 * We can represent a nameless term as a tree where leaves with pointers are variables,
 * nodes of degree 1 are abstraction, and nodes of degree 2 are application
 */

export type TreeAbstraction = readonly [TreeTerm]
export type TreeApplication = readonly [
  TreeTerm,
  TreeTerm,
]
export type TreeVariable = number
export type TreeTerm =
  | TreeAbstraction
  | TreeApplication
  | TreeVariable

export const variable = (pointer: number): TreeVariable => pointer
export const abstraction = (
  term: TreeTerm,
): TreeAbstraction => [term]
export const application = (
  left: TreeTerm,
  right: TreeTerm,
): TreeApplication => [left, right]

export const match = <T>(
  variable: (pointer: number) => T,
  abstraction: (term: TreeTerm) => T,
  application: (left: TreeTerm, right: TreeTerm) => T,
) => (term: TreeTerm): T => {
  if (typeof term === 'number') return variable(term)
  if (term.length === 1) return abstraction(term[0])
  if (term.length === 2) return application(term[0], term[1])
  return term
}

export const printTree: (t: TreeTerm) => string = match(
  idx => `${idx}`,
  term => `(\\. ${printTree(term)})`,
  (left, right) => `(${printTree(left)} ${printTree(right)})`,
)

/**
 * Shifting
 *
 * Performs the `d`-place shift of a term above cutoff `c`
 * @param d places to shift
 * @param c cutoff
 */
export const shift: (
  d: number,
  c?: number,
) => (t: TreeTerm) => TreeTerm = (d, c = 0) =>
  match(
    k => (k < c ? k : k + d) as TreeTerm,
    t1 => [shift(d, c + 1)(t1)],
    (t1, t2) => [shift(d, c)(t1), shift(d, c)(t2)],
  )

/**
 * Substitution of a term `s` for variable number `j` in a term `t`
 * @param j variable
 * @param s term to substitute
 * @param t term containing variable
 */
export const substitute: (
  j: TreeVariable,
  s: TreeTerm,
) => (t: TreeTerm) => TreeTerm = (j, s) =>
  match(
    k => (k === j ? s : k),
    t1 => [substitute(j + 1, shift(1)(s))(t1)],
    (t1, t2) => [substitute(j, s)(t1), substitute(j, s)(t2)],
  )

/**
 * Beta reduction with nameless terms
 *
 * see the definition on page 81 of TAPL
 */
export const betareduce = (
  [t1]: TreeAbstraction,
  v: TreeVariable,
) => shift(-1)(substitute(0, shift(1)(v))(t1))
