import { Context } from '.'
import { printer } from '../printer'

export const emptycontext = () => [] as Context
export const defaultcontext = (): Context => [
  [
    'print',
    {
      kind: 'builtin',
      handler: (t, ctx) => {
        console.log(printer(ctx)(t))
        return undefined
      },
    },
  ],
  [
    'printast',
    {
      kind: 'builtin',
      handler: t => {
        console.log(t)
        return undefined
      },
    },
  ],
  [
    'printnum',
    {
      kind: 'builtin',
      handler: t => {
        if (t.kind !== 'abs') {
          throw new Error(`Expected value, got ${t.kind}`)
        }

        return undefined
      },
    },
  ],
]
