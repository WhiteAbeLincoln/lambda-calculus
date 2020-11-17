import { addbinding, Binding, Context } from '../context'
import { Token } from '../scanner'
import { dummyinfo, Info } from '../support'
import { Term } from './term'

export type EvalCommand = {
  kind: 'eval'
  info: Info
  term: Term
  tokens?: Token[]
}
export type BindCommand = {
  kind: 'bind'
  info: Info
  name: string
  binding: Binding
  tokens?: Token[]
}
export type Command = EvalCommand | BindCommand

export const bindCmd = (ctx: Context) => (
  name: string,
  term: Term,
): readonly [BindCommand, Context] => [
  {
    kind: 'bind',
    info: dummyinfo,
    binding: { kind: 'var', term },
    name,
  },
  addbinding(ctx, name, { kind: 'var', term }),
]

export const evalCmd = (term: Term): EvalCommand => ({
  kind: 'eval',
  term,
  info: dummyinfo,
})
