import { Term } from '../parser'

// Not anything interesting for now
export type NameBind = { kind: 'name' }
export type VarBind = { kind: 'var'; term: Term }
export type BuiltinBind = {
  kind: 'builtin'
  handler: (t: Term, ctx: Context) => Term | undefined
}
export type Binding = NameBind | VarBind | BuiltinBind
export type Context = Array<[name: string, binding: Binding]>

export const binding = (): Binding => ({ kind: 'name' })

export const ctxlength = (ctx: Context): number => ctx.length
export const addbinding = (
  ctx: Context,
  name: string,
  binding: Binding,
): Context => [[name, binding], ...ctx]
export const addname = (ctx: Context, name: string): Context =>
  addbinding(ctx, name, binding())
export const index2name = (ctx: Context, idx: number): string | undefined =>
  ctx[idx]?.[0]
export const name2index = (ctx: Context, name: string): number | undefined => {
  const i = ctx.findIndex(([n]) => name === n)
  return i === -1 ? undefined : i
}
export const isnamebound = (ctx: Context, name: string): boolean =>
  name2index(ctx, name) !== undefined
