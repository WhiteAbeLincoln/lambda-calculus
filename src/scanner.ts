import { dummyinfo, Info } from './support'
import { DiscriminateUnion, useState } from './util'

export interface TokenBase {
  value: string
  info: Info
  /**
   * extra insignificant whitespace occuring before the token, used for printing errors
   */
  extra: string
}
export interface OParenTok extends TokenBase {
  kind: 'openparen'
  value: '('
}
export interface CParenTok extends TokenBase {
  kind: 'closeparen'
  value: ')'
}
export interface DotTok extends TokenBase {
  kind: 'dot'
  value: '.'
}
export interface BackslashTok extends TokenBase {
  kind: 'backslash'
  value: '\\'
}
export interface VarTok extends TokenBase {
  kind: 'var'
  value: string
}
export interface EqualsTok extends TokenBase {
  kind: 'equals'
  value: '='
}
export interface SemiTok extends TokenBase {
  kind: 'semicolon'
  value: ';'
}
// we automatically insert semicolons at newlines in parsing
// unless we are in the middle of a parenthesized expression
export interface NewlineTok extends TokenBase {
  kind: 'newline'
  value: '\n'
}

export type Token =
  | OParenTok
  | CParenTok
  | DotTok
  | BackslashTok
  | VarTok
  | EqualsTok
  | SemiTok
  | NewlineTok

export const tokIs = <K extends Token['kind']>(k: K) => (
  t: Token,
): t is DiscriminateUnion<Token, 'kind', K> => t.kind === k

export const mkTok = <K extends Token['kind']>(kind: K) =>
  ({
    info: dummyinfo,
    kind,
    value:
      kind === 'backslash'
        ? '\\'
        : kind === 'dot'
        ? '.'
        : kind === 'equals'
        ? '='
        : kind === 'newline'
        ? '\n'
        : kind === 'openparen'
        ? '('
        : kind === 'closeparen'
        ? ')'
        : kind === 'semicolon'
        ? ';'
        : kind === 'var'
        ? ''
        : kind,
    extra: '',
  } as DiscriminateUnion<Token, 'kind', K>)

export const tokEquals = (x: Token, y: Token) =>
  x.kind === y.kind && x.value === y.value

const whitespace = /^\s$/

/**
 * Creates a state and a function that operates on that state to increment line and column numbers
 *
 * See React Hooks for a similar concept
 * @param obj optional initial position state
 */
export const usePositionState = (
  obj: { line: number; col: number } = { line: 1, col: 0 },
) => {
  const state = { ...obj }
  let newline = false

  return {
    pos: state as Readonly<typeof state>,
    setPosFrom: (v: string) => {
      if (newline) {
        state.line += 1
        state.col = 0
        newline = false
      }

      // we count newlines as the last character
      // on the current line, but we must remember
      // to increment the line number for the next character
      if (v === '\n') {
        newline = true
        state.col += 1
      } else {
        state.col += v.length
      }
    },
    reset: () => {
      state.line = obj.line
      state.col = obj.col
    },
  } as const
}

const useAccum = () => {
  let s: {
    pos: { line: number; col: number }
    accum: string
  } = {
    pos: { line: 0, col: 0 },
    accum: '',
  }

  const copy = () => ({ ...s, pos: { ...s.pos } })

  const reset = () => {
    const oldState = copy()
    s.pos = { line: 0, col: 0 }
    s.accum = ''
    return oldState
  }

  const accumulate = (char: string, pos: { line: number; col: number }) => {
    if (s.accum.length === 0) {
      s.pos = { ...pos }
    }
    s.accum += char
  }

  return {
    state: s as Readonly<typeof s>,
    reset,
    accumulate,
  } as const
}

export const useScanner = (filen = '') => {
  const { state, setState: changeState } = useState<'none' | 'var' | 'comment'>(
    'none',
  )
  const { reset: resetAccum, accumulate } = useAccum()
  const { reset: resetW, accumulate: accumW } = useAccum()
  const { pos, setPosFrom } = usePositionState()

  const tok = <K extends Token['kind']>(kind: K) => ({
    ...mkTok(kind),
    info: {
      filen,
      line: pos.line,
      column: pos.col,
    },
  })

  const handleVar = () => {
    changeState('none')
    const a = resetAccum()
    const w = resetW()
    return {
      info: {
        filen,
        line: a.pos.line,
        column: a.pos.col,
      },
      kind: 'var',
      value: a.accum,
      extra: w.accum,
    } as const
  }

  const ret = <K extends Token['kind']>(
    kind?: K,
    value?: DiscriminateUnion<Token, 'kind', K>['value'],
  ) => {
    const toks: Token[] = []
    if (state.value === 'var') {
      toks.push(handleVar())
    }
    if (kind) {
      const v = tok(kind)
      const w = resetW()
      if (value !== undefined) v.value = value
      v.extra = w.accum
      toks.push(v)
    }

    return toks
  }

  const read = (c: string): Token[] => {
    setPosFrom(c)
    if (state.value === 'comment') {
      if (
        c === '\n' ||
        c === '\r' ||
        c === '\u0085' ||
        c === '\u2028' ||
        c === '\u2029' ||
        c === ''
      ) {
        changeState('none')
        return []
      } else {
        return []
      }
    }

    if (whitespace.test(c)) {
      if (c === '\n') {
        return ret('newline')
      }
      accumW(c, pos)
      return ret()
    }

    if (c === '(' || c === ')')
      return c === '(' ? ret('openparen') : ret('closeparen')
    if (c === '.') return ret('dot')
    if (c === '\\') return ret('backslash')
    if (c === '=') return ret('equals')
    if (c === ';') return ret('semicolon')

    if (c === '#') {
      changeState('comment')
      return ret()
    }

    if (c !== '') {
      changeState('var')
      accumulate(c, pos)
      return []
    }

    // should never reach this unless c === ''
    return []
  }

  return { pos, read } as const
}

export function* scanner(input: string, filen = '') {
  const { read } = useScanner(filen)
  for (const char of input) {
    yield* read(char)
  }
}

export async function* streamScanner(
  stream: AsyncIterable<Buffer | string>,
  filen = '',
) {
  const { read } = useScanner(filen)
  for await (const buff of stream) {
    const chars = buff.toString('utf8')
    for (const char of chars) {
      yield* read(char)
    }
  }
}

export const showToken = (t: Token) => {
  return `${t.extra}${t.value}`
}
