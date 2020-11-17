import type { Term } from '../parser/term'
import { printer } from '../namelessprinter'

// Not anything interesting for now
export type NameBind = { kind: 'name' }
export type VarBind = { kind: 'var'; term: Term }
export type BuiltinBind = {
  kind: 'builtin'
  handler: (t: Term, ctx: Context) => readonly [Context, Term] | undefined
}
export type Binding = NameBind | VarBind | BuiltinBind
export type Context = {
  /** stores terms to names for printing */
  nameCache: Record<string, ReadonlySet<string>>
  bindings: readonly [name: string, binding: Binding][]
}

export const binding = (): Binding => ({ kind: 'name' })

export const ctxlength = (ctx: Context): number => ctx.bindings.length
export const addbinding = (
  ctx: Context,
  name: string,
  binding: Binding,
): Context => {
  let nameCache = ctx.nameCache
  if (binding.kind === 'var') {
    const printed = printer(binding.term)
    const existing = new Set(...(nameCache[printed] || [])) || new Set()
    existing.add(name)
    nameCache = { ...nameCache, [printed]: existing }
  }
  return { nameCache, bindings: [[name, binding], ...ctx.bindings] }
}
export const addname = (ctx: Context, name: string): Context =>
  addbinding(ctx, name, binding())
export const index2binding = (
  ctx: Context,
  idx: number,
): readonly [name: string, binding: Binding] | undefined => ctx.bindings[idx]
export const index2name = (ctx: Context, idx: number): string | undefined =>
  ctx.bindings[idx]?.[0]
export const name2index = (ctx: Context, name: string): number | undefined => {
  const i = ctx.bindings.findIndex(([n]) => name === n)
  return i === -1 ? undefined : i
}
export const isnamebound = (ctx: Context, name: string): boolean =>
  name2index(ctx, name) !== undefined
export const getboundnames = (ctx: Context, term: Term): string[] =>
  [...(ctx.nameCache[printer(term)] || [])]
export const copyctx = (ctx: Context): Context => ({
  nameCache: { ...ctx.nameCache },
  bindings: [...ctx.bindings],
})
export const emptycontext = (): Context => ({ bindings: [], nameCache: {} })

export const pickfreshname = (
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

export const boundnames = (ctx: Context) => ctx.bindings.map(([n]) => n)
