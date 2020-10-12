import { defaultcontext, emptycontext } from './context/contexts'
import { evaluate } from './evaluator'
import { asyncRun, run } from './parser'
import { InfoError } from './support'
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { Context } from './context'
import { printer } from './printer'
import { useDeferred } from './util'

const help = `
Lambda Calculus

Usage: ./lc [...OPTIONS] < FILES

Options:
  -h | --help   Show this screen
  -i            Start REPL
  -np           Don't include prelude
  -nb           Don't include builtins
`

async function main(args: string[]) {
  if (args.includes('-h') || args.includes('--help')) {
    console.log(help)
    process.exit(0)
  }
  const np = args.includes('-np')
  const nb = args.includes('-nb')
  const interactive = args.includes('-i')
  let ctx = nb ? emptycontext() : defaultcontext()
  if (!np) {
    const file = path.join(__dirname, 'prelude.lc')
    await asyncRun(([cmd, c]) => {
      ctx = c
      if (cmd.kind === 'eval') {
        evaluate(c, cmd.term)
      }
    })(fs.createReadStream(file), ctx, file)
  }

  if (interactive) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '> ',
    })
    const startctx: Context = [...ctx]
    const [promise, res, rej] = useDeferred<undefined>()

    rl.on('line', input => {
      switch (input.trim()) {
        case ':reset': {
          ctx = startctx
          console.log('Reset context')
          break
        }
        case ':ctx': {
          console.log(ctx)
          break
        }
        case ':quit':
        case ':q': {
          rl.close()
          return
        }
        case '': {
          break
        }
        default: {
          try {
            run(([cmd, c]) => {
              ctx = c
              console.log(
                cmd.kind === 'eval'
                  ? printer(ctx)(evaluate(c, cmd.term))
                  : cmd.binding.kind === 'var'
                  ? `${cmd.name} = ${printer(ctx.slice(1))(cmd.binding.term)}`
                  : cmd.name,
              )
            })(input.trim() + '\n', ctx, 'repl')
          } catch (e) {
            // we want to recover from parsing errors
            // but reject on runtime/js errors
            if (e instanceof InfoError) {
              console.error(e.message)
            } else {
              rej(e)
            }
          }
        }
      }
      rl.prompt()
    }).on('close', () => {
      res(undefined)
    })

    rl.prompt()
    return promise
  } else {
    await asyncRun(([cmd, c]) => {
      ctx = c
      if (cmd.kind === 'eval') {
        evaluate(c, cmd.term)
      }
    })(process.stdin, ctx, 'stdin')
  }
}

const [, , ...args] = process.argv
main(args)
  .then(() => process.exit(0))
  .catch(v => {
    if (v instanceof InfoError) {
      console.error(v.message)
    } else {
      console.error(v)
    }
    process.exit(1)
  })
