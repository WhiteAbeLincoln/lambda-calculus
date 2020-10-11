/**
 * Grammar for lambda-calculus
 *
 * t ::=     # terms
 *    x      # variable, where x is a string of lowercase letters
 *    \x.t   # abstraction
 *    t t    # application
 */
import {
  addbinding,
  addname,
  Binding,
  Context,
  ctxlength,
  name2index,
} from './context'
import { mkTok, scanner, streamScanner, Token } from './scanner'
import { Info, ParseError } from './support'
import { arrEquals, DiscriminateUnion } from './util'

type NodeKind = 'var' | 'abs' | 'app'

export interface Node {
  kind: NodeKind
  tokens?: Token[]
  info: Info
}

export interface VariableNode extends Node {
  kind: 'var'
  /** de Bruijn index */
  idx: number
  /** contains the total length of the ctx in which var occurs */
  depth: number
}

export interface AbstractionNode extends Node {
  kind: 'abs'
  term: Term
  varname?: string
}

export interface ApplicationNode extends Node {
  kind: 'app'
  left: Term
  right: Term
}

export type Term = VariableNode | AbstractionNode | ApplicationNode
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

/** Maps over the abstract syntax tree of terms */
export const termWalk = (fn: (v: VariableNode, depth: number) => Term) => (
  startDepth: number = 0,
) => (t: Term): Term => {
  function walk(c: number, t: Term): Term {
    switch (t.kind) {
      case 'var': {
        return fn(t, c)
      }
      case 'abs': {
        return { ...t, term: walk(c + 1, t.term) }
      }
      case 'app': {
        return { ...t, left: walk(c, t.left), right: walk(c, t.right) }
      }
    }
  }
  return walk(startDepth, t)
}

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

function* parse(ctx: Context) {
  function* peek(
    k = 1,
  ): Generator<TokRequest, PeekResponse['value'], TokResponse> {
    const b = yield { kind: 'peek', k } as const
    expectPeek(b)
    return b.value
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

  function* command(
    ctx: Context,
  ): Generator<TokRequest, [Command, Context] | undefined | null, TokResponse> {
    if (yield* tryMatch('var', 'equals')) {
      const v = yield* readExpecting('var', 'identfier')
      const e = yield* readExpecting('equals', '"="')
      const t = yield* term(ctx)
      return [
        {
          kind: 'bind',
          info: v.info,
          binding: { kind: 'var', term: t },
          name: v.value,
          tokens: [v, e, ...(t.tokens ?? [])],
        },
        addbinding(ctx, v.value, { kind: 'var', term: t }),
      ]
    }
    if ((yield* tryMatch('newline')) || (yield* tryMatch('semicolon'))) {
      // consume separator token
      yield* read()
      return undefined
    }
    if (!(yield* done())) {
      const t = yield* term(ctx)
      return [{ kind: 'eval', term: t, info: t.info, tokens: t.tokens }, ctx]
    }

    return null
  }

  function* term(
    ctx: Context,
    inparen = false,
  ): Generator<TokRequest, Term, TokResponse> {
    const app = yield* appterm(ctx, inparen)
    if (app) return app

    const slash = yield* readExpecting('backslash', '"\\"')
    const v = yield* readExpecting('var', 'identifier')
    const dot = yield* readExpecting('dot', '"."')
    const t = yield* term(addname(ctx, v.value), inparen)

    return {
      kind: 'abs',
      info: slash.info,
      tokens: [slash, v, dot, ...(t.tokens ?? [])],
      varname: v.value,
      term: t,
    }
  }

  function* tryatomic(
    ctx: Context,
    inparen = false,
  ): Generator<TokRequest, Term | undefined, TokResponse> {
    let v: Term | boolean = false
    do {
      v = yield* atomicterm(ctx)
      if (v === true) {
        // consume newline
        yield* read()
      }
    } while (v === true && inparen)

    return typeof v === 'boolean' ? undefined : v
  }

  function* appterm(
    ctx: Context,
    inparen = false,
  ): Generator<TokRequest, Term | undefined, TokResponse> {
    let lapp = yield* tryatomic(ctx, inparen)
    let rapp: Term | undefined = undefined
    if (!lapp) return undefined

    do {
      rapp = yield* tryatomic(ctx, inparen)
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

  function* atomicterm(
    ctx: Context,
  ): Generator<TokRequest, Term | boolean, TokResponse> {
    if (yield* tryMatch('openparen')) {
      const open = yield* readExpecting('openparen', '"("')
      const t = yield* term(ctx, true)
      const close = yield* readExpecting('closeparen', '")"')
      return { ...t, tokens: [open, ...(t.tokens ?? []), close] }
    }

    if (yield* tryMatch('var')) {
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

    if (yield* tryMatch('newline')) {
      return true
    }

    return false
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
