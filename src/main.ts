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
      if (input.trim() === ':reset') {
        ctx = startctx
        console.log('Reset context')
      } else if (input.trim() === ':quit' || input.trim() === ':q') {
        rl.close()
        return
      } else if (input.trim() !== '') {
        try {
          run(([cmd, c]) => {
            ctx = c
            if (cmd.kind === 'eval') {
              console.log(printer(ctx)(evaluate(c, cmd.term)))
            } else {
              if (cmd.binding.kind === 'var') {
                console.log(
                  `${cmd.name} = ${printer(ctx.slice(1))(cmd.binding.term)}`,
                )
              } else {
                console.log(cmd.name)
              }
            }
          })(input + '\n', ctx, 'repl')
        } catch (e) {
          if (e instanceof InfoError) {
            console.error(e.message)
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
    }
    process.exit(1)
  })
