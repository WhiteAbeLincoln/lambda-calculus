import { defaultcontext } from './context/contexts'
import { evaluate } from './evaluator'
import { asyncRun, run } from './parser/parser'
import { InfoError } from './support'
import fs from 'fs'
import path from 'path'
import repl from 'repl'
import { boundnames, Context, emptycontext, getboundnames } from './context'
import { printer } from './printer'
import { useDeferred } from './util'
import { Console } from 'console'
import { Term } from './parser/term'

const help = `
Lambda Calculus

Usage: ./lc [...OPTIONS] < FILES

Options:
  -h | --help   Show this screen
  -i            Start REPL
  -np           Don't include prelude
  -nb           Don't include builtins
`

const printWName = (ctx: Context, t: Term) => {
  const printed = printer(ctx, t)
  const bound = getboundnames(ctx, t)
  return bound.length > 0
    ? `${printed}  # ${bound.join(',')} = ${printer(ctx, t, false)}`
    : printed
}

const runInteractive = (
  ctx: Context,
  input?: NodeJS.ReadableStream,
  output?: NodeJS.WritableStream,
) => {
  const startctx: Context = ctx
  const [promise, res] = useDeferred<undefined>()
  const console = new Console(output || process.stdout)
  const isRecoverableError = (e: Error) => {
    if (e instanceof InfoError) {
      return /but received EOF$/.test(e.message)
    }
    return false
  }

  const replEval: repl.REPLEval = function replEval(
    evalCmd,
    _context,
    file,
    cb,
  ) {
    let result: string | undefined
    try {
      run(([cmd, c]) => {
        const oldctx = ctx
        ctx = c
        result =
          cmd.kind === 'eval'
            ? printWName(ctx, evaluate(c, cmd.term))
            : cmd.binding.kind === 'var'
            ? `${cmd.name} = ${printer(oldctx, cmd.binding.term)}`
            : cmd.name
      })(evalCmd + '\n', ctx, file)
    } catch (e) {
      if (isRecoverableError(e)) {
        return cb(new repl.Recoverable(e), undefined)
      } else if (e instanceof InfoError) {
        console.error(e.message)
        return cb(null, undefined)
      } else {
        return cb(e, undefined)
      }
    }

    cb(null, result)
  }

  const writer: repl.REPLWriter = function writer(obj) {
    return obj
  }

  const replServer = repl.start({
    prompt: '> ',
    eval: replEval,
    input,
    output,
    writer,
    ignoreUndefined: true,
  })
  replServer.defineCommand('reset', {
    help: 'Reset the context',
    action() {
      this.clearBufferedCommand()
      ctx = startctx
      console.log('Reset context')
    },
  })
  replServer.defineCommand('ctx', {
    help: 'Print the current context',
    action() {
      this.clearBufferedCommand()
      console.log(boundnames(ctx))
    },
  })

  replServer.on('exit', () => {
    res(undefined)
  })

  return promise
}

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
    return runInteractive(ctx)
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
