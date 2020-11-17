import { addbinding, Context } from '.'
import { Term, termEq, abs as tabs, app as tapp } from '../parser/term'
import { printer } from '../printer'
import { printer as printnameless } from '../namelessprinter'
import { dummyinfo } from '../support'
import { shiftForCtx } from '../shift'

const trueTerm = tabs(tabs(1))
trueTerm.bindingname = 'true'
const falseTerm = tabs(tabs(0))
falseTerm.bindingname = 'false'

let counter = 0

export const defaultcontext = (): Context => ({
  bindings: [
    [
      '`print',
      {
        kind: 'builtin',
        handler: (t, ctx) => {
          console.log(printer(ctx, t, false))
          return undefined
        },
      },
    ],
    [
      '`printnameless',
      {
        kind: 'builtin',
        handler: t => {
          console.log(printnameless(t))
          return undefined
        },
      },
    ],
    [
      '`printast',
      {
        kind: 'builtin',
        handler: t => {
          console.log(JSON.stringify(t, null, 2))
          return undefined
        },
      },
    ],
    [
      '`termeq',
      {
        kind: 'builtin',
        handler: (t1, ctx) => {
          // we add at end to avoid shifting the indexes of any existing variables
          const newctx = addbinding(ctx, '`termeq_bound', {
            kind: 'builtin',
            handler: t2 => {
              // restore old context
              return [ctx, termEq(t1, t2) ? trueTerm : falseTerm]
            },
          })
          return [newctx, tabs(tapp(1, 0))]
        },
      },
    ],
    [
      '`count',
      {
        kind: 'builtin',
        handler: () => {
          counter++
          return undefined
        },
      },
    ],
    [
      '`printcount',
      {
        kind: 'builtin',
        handler: () => {
          console.log(counter)
          counter = 0
          return undefined
        },
      },
    ],
    [
      '`printnum',
      {
        kind: 'builtin',
        handler: (t, ctx) => {
          // when we fully apply a church-encoded number, the given succ function gets
          // called n times, where n is the number value
          // consider 6 (\x. print x) 0
          // the print function will be called 6 times
          // (we wrap print in a lambda because we cannot pass builtins as values)
          // we need a way to know when to terminate. We can rely on the
          // eager evaluation of builtin functions by passing 6 (\x. count x) 0
          // to another builtin, whose purpose is to print the counted value
          // ultimately this means the initial value 0 that we pass doesn't matter
          // since the final builtin will ignore it
          // our final term to evaluate is
          // printnum n => printnum_print (n (\x. printnum_count x) n)

          if (t.kind !== 'abs') {
            throw new Error(`Expected value, got ${t.kind}`)
          }
          let counter = 0
          const newctx = addbinding(
            addbinding(ctx, '`printnum_count', {
              kind: 'builtin',
              handler: () => {
                counter++
                return undefined
              },
            }),
            '`printnum_print',
            {
              kind: 'builtin',
              handler: t => {
                console.log(counter)
                return [ctx, t]
              },
            },
          )

          // \n. `printnum_print (n (\x. `printnum_count x) n)
          const fnTerm: Term = tabs(tapp(1, tapp(0, tabs(tapp(3, 0)), 0)))

          return [
            newctx,
            {
              kind: 'app',
              left: fnTerm,
              right: shiftForCtx(ctx, newctx)(t),
              info: dummyinfo,
            },
          ]
        },
      },
    ],
  ],
  nameCache: {},
})
