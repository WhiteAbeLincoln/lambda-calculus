/**
 * Grammar for lambda-calculus
 *
 * t ::=     # terms
 *    x      # variable, where x is a string of lowercase letters
 *    \x.t   # abstraction
 *    t t    # application
 */
import { addname, Context, ctxlength, name2index } from '../context'
import { mkTok, scanner, streamScanner, Token } from '../scanner'
import { Info, ParseError } from '../support'
import { arrEquals, DiscriminateUnion } from '../util'
import { bindCmd, Command, evalCmd } from './command'
import { abs, AbstractionNode, Term } from './term'

type PeekReq = {
  kind: 'peek'
  k: number
}
type ReadReq = {
  kind: 'read'
}
type FinishedReq = {
  kind: 'finished'
}

type TokRequest = PeekReq | ReadReq | FinishedReq
type FinishedResponse = { kind: 'finished'; value: boolean }
type PeekResponse = { kind: 'peek'; value: Token[] }
type ReadResponse = {
  kind: 'read'
  value: [Token | undefined, Info | undefined]
}
type TokResponse = PeekResponse | ReadResponse | FinishedResponse

const expectResponse = <K extends TokResponse['kind']>(kind: K) => (
  t: TokResponse,
): asserts t is DiscriminateUnion<TokResponse, 'kind', K> => {
  if (t.kind !== kind)
    throw new Error(`Expected a ${kind} response but got ${t.kind}`)
}
const expectPeek: (
  t: TokResponse,
) => asserts t is PeekResponse = expectResponse('peek')
const expectRead: (
  t: TokResponse,
) => asserts t is ReadResponse = expectResponse('read')
const expectFinished: (
  t: TokResponse,
) => asserts t is FinishedResponse = expectResponse('finished')

/**
 * Parses using a generator function
 *
 * The generator sends out a TokRequest, which is either to read a token,
 * peek (lookahead) at some number of tokens, or see if the token input
 * is finished. The generator caller returns a TokResponse. Helper
 * functions assert that the response correctly matches the request.
 */
function* parse(ctx: Context) {
  function* peek(
    k = 1,
  ): Generator<TokRequest, PeekResponse['value'], TokResponse> {
    const b = yield { kind: 'peek', k } as const
    expectPeek(b)
    return b.value
  }

  function* peekNext() {
    const next = yield* peek()
    return next.length >= 1 ? next[0] : undefined
  }

  function* read(): Generator<TokRequest, ReadResponse['value'], TokResponse> {
    const b = yield { kind: 'read' }
    expectRead(b)
    return b.value
  }

  function* done(): Generator<TokRequest, boolean, TokResponse> {
    const b = yield { kind: 'finished' }
    expectFinished(b)
    return b.value
  }

  function* tryMatch<Ts extends Array<Token | Token['kind']>>(...trytoks: Ts) {
    const toks = yield* peek(trytoks.length)
    return arrEquals((x: Token, y: Token) => x.kind === y.kind)(
      toks,
      trytoks.map(t => (typeof t === 'string' ? mkTok(t) : t)),
    )
  }

  function* readExpecting<K extends Token['kind']>(
    kind: K,
    expected = kind as string,
  ) {
    const [v, info] = yield* read()
    if (v?.kind !== kind) {
      throw new ParseError(
        info,
        `Expected ${expected}, but received ${
          v?.value ? JSON.stringify(v.value) : 'EOF'
        }`,
      )
    }
    return v
  }

  /*
   * term ::= x             (variable)
   *       |  \x*. t        (abstraction)
   *       |  t t           (application)
   * command ::= x = term;   (binding)
   *          |  term;       (evaluate)
   */

  function* command(
    ctx: Context,
  ): Generator<TokRequest, [Command, Context] | undefined | null, TokResponse> {
    if (yield* tryMatch('var', 'equals')) {
      const v = yield* readExpecting('var', 'identfier')
      // we reserve ` for scoping our builtin bindings
      // purely a hack to allow accessing native apis, shouldn't
      // exist in a compiled version
      if (v.value.startsWith('`')) {
        throw new ParseError(
          v.info,
          `Illegal identifier for binding: ${JSON.stringify(v.value)}`,
        )
      }
      const e = yield* readExpecting('equals', '"="')
      const t = yield* term(ctx)
      const [binding, newctx] = bindCmd(ctx)(v.value, t)
      return [
        {
          ...binding,
          info: v.info,
          tokens: [v, e, ...(t.tokens ?? [])],
        },
        newctx,
      ]
    }
    if ((yield* tryMatch('newline')) || (yield* tryMatch('semicolon'))) {
      // consume separator token
      yield* read()
      return undefined
    }
    if (!(yield* done())) {
      const t = yield* term(ctx)
      return [{ ...evalCmd(t), info: t.info, tokens: t.tokens }, ctx]
    }

    return null
  }

  function* consumeNewlines() {
    let next = yield* peekNext()
    while (next && next.kind === 'newline') {
      // consume newline
      yield* read()
      next = yield* peekNext()
    }
  }

  function* absterm(
    ctx: Context,
    inparen = false,
  ): Generator<TokRequest, Term, TokResponse> {
    const slash = yield* readExpecting('backslash', '"\\"')
    const vs = yield* termBinders()
    if (vs.length === 0) {
      throw new ParseError(
        slash.info,
        `Expected at least one binding variable, received 0`,
      )
    }
    const dot = yield* readExpecting('dot', '"."')
    const newctx = vs.reduce((prevCtx, v) => addname(prevCtx, v.value), ctx)
    if (inparen) {
      yield* consumeNewlines()
    }
    const t = yield* term(newctx, inparen)

    return vs.reduceRight(
      (t, v): AbstractionNode => ({
        kind: 'abs',
        info: slash.info,
        tokens: [slash, ...vs, dot, ...(t.tokens ?? [])],
        varname: v.value,
        term: t,
      }),
      t,
    )
  }

  function* termBinders(): Generator<TokRequest, Token[], TokResponse> {
    const vars: Token[] = []
    while (yield* tryMatch('var')) {
      vars.push(yield* readExpecting('var', 'identifier'))
    }

    return vars
  }

  function* parenterm(ctx: Context): Generator<TokRequest, Term, TokResponse> {
    const open = yield* readExpecting('openparen', '"("')
    yield* consumeNewlines()
    const t = yield* term(ctx, true)
    yield* consumeNewlines()
    const close = yield* readExpecting('closeparen', '")"')
    return { ...t, tokens: [open, ...(t.tokens ?? []), close] }
  }

  function* varterm(ctx: Context): Generator<TokRequest, Term, TokResponse> {
    const r = yield* readExpecting('var', 'identifier')
    const idx = name2index(ctx, r.value)
    if (idx === undefined) {
      throw new ParseError(r.info, `Identifier ${r.value} is unbound`)
    }
    return {
      kind: 'var',
      idx,
      depth: ctxlength(ctx),
      info: r.info,
      tokens: [r],
    }
  }

  // matches a variable or a term in parentheses
  function* atomicterm(
    ctx: Context,
    inparen = false,
  ): Generator<TokRequest, Term, TokResponse> {
    if (yield* tryMatch('openparen')) {
      return yield* parenterm(ctx)
    }

    if (yield* tryMatch('var')) {
      return yield* varterm(ctx)
    }

    return yield* absterm(ctx, inparen)
  }

  function* startsTerm() {
    const nextT = yield* peekNext()
    return (
      nextT &&
      (nextT.kind === 'openparen' ||
        nextT.kind === 'backslash' ||
        nextT.kind === 'var')
    )
  }

  function* term(
    ctx: Context,
    inparen = false,
  ): Generator<TokRequest, Term, TokResponse> {
    let lapp = yield* atomicterm(ctx, inparen)
    let rapp: Term | undefined = undefined
    do {
      if (inparen) {
        yield* consumeNewlines()
      }
      rapp = (yield* startsTerm()) ? yield* atomicterm(ctx, inparen) : undefined
      if (rapp) {
        lapp = {
          kind: 'app',
          left: lapp,
          right: rapp,
          tokens: [...(lapp.tokens ?? []), ...(rapp.tokens ?? [])],
          info: lapp.info,
        }
      }
    } while (rapp !== undefined)

    return lapp
  }

  let e: [Command, Context] | undefined | null = null
  do {
    e = yield* command(ctx)
    if (e) {
      ctx = e[1]
      yield { kind: 'result', value: e } as const
    }
  } while (e !== null)
}

/**
 * accepts an iterable of tokens, returns an iterable of Commands and Contexts
 */
export function* parser(toks: Iterable<Token>, ctx: Context) {
  const tokens = [...toks]
  let lastInfo: Info | undefined = undefined
  const onPeek = (k: number): PeekResponse['value'] => {
    return tokens.slice(0, k)
  }
  const onRead = (): ReadResponse['value'] => {
    const r = tokens.shift()
    if (r) lastInfo = r.info
    return [r, lastInfo]
  }
  const onFinished = (): FinishedResponse['value'] => {
    return tokens.length === 0
  }
  const p = parse(ctx)
  let reqr = p.next()
  while (!reqr.done) {
    const req = reqr.value
    switch (req.kind) {
      case 'peek': {
        reqr = p.next({ kind: 'peek', value: onPeek(req.k) })
        continue
      }
      case 'read': {
        reqr = p.next({ kind: 'read', value: onRead() })
        continue
      }
      case 'finished': {
        reqr = p.next({ kind: 'finished', value: onFinished() })
        continue
      }
      case 'result': {
        yield req.value
        reqr = p.next()
      }
    }
  }

  return reqr.value
}

/**
 * accepts an async iterable of tokens, returns an async iterable of Commands and Contexts
 */
export async function* streamParser(
  stream: AsyncIterable<Token>,
  ctx: Context,
) {
  const buffer: Token[] = []
  let lastInfo: Info | undefined = undefined
  let finished = false

  async function readN(n: number) {
    for await (const tok of stream) {
      buffer.push(tok)
      n--
      if (n === 0) return
    }
    finished = true
  }

  async function onPeek(k: number): Promise<PeekResponse['value']> {
    if (buffer.length < k) {
      await readN(buffer.length - k)
    }
    return buffer.slice(0, k)
  }

  async function onRead(): Promise<ReadResponse['value']> {
    if (buffer.length === 0) {
      await readN(1)
    }
    const r = buffer.shift()
    if (r) lastInfo = r.info
    return [r, lastInfo]
  }

  function onFinished() {
    return buffer.length === 0 && finished
  }

  const p = parse(ctx)
  let reqr = p.next()
  while (!reqr.done) {
    const req = reqr.value
    switch (req.kind) {
      case 'peek': {
        reqr = p.next({ kind: 'peek', value: await onPeek(req.k) })
        continue
      }
      case 'read': {
        reqr = p.next({ kind: 'read', value: await onRead() })
        continue
      }
      case 'finished': {
        reqr = p.next({ kind: 'finished', value: onFinished() })
        continue
      }
      case 'result': {
        yield req.value
        reqr = p.next()
      }
    }
  }
}

export const run = (handler: (v: [Command, Context]) => void) => (
  input: string,
  context: Context,
  filen?: string,
) => {
  for (const v of parser(scanner(input, filen), context)) {
    handler(v)
  }
}

export const asyncRun = (handler: (v: [Command, Context]) => void) =>
  async function (
    stream: AsyncIterable<string | Buffer>,
    context: Context,
    filen?: string,
  ) {
    for await (const v of streamParser(streamScanner(stream, filen), context)) {
      handler(v)
    }
  }
