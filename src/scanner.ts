import { usePositionState } from './util'

export interface TokenBase {
  value: string
  line: number
  column: number
}
export interface ParenTok extends TokenBase {
  kind: 'paren'
  value: '(' | ')'
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
type Token = ParenTok | DotTok | BackslashTok | VarTok | EqualsTok

const whitespace = /^\s$/

const useAccum = <T extends string>() => (initState: T) => {
  let s: {
    state: T
    pos: { line: number; col: number }
    accum: string
  } = {
    state: initState,
    pos: { line: 0, col: 0 },
    accum: '',
  }

  const copy = () => ({ ...s, pos: { ...s.pos } })

  const reset = () => {
    const oldState = copy()
    s.pos = { line: 0, col: 0 }
    s.state = initState
    s.accum = ''
    return oldState
  }

  const changeState = (newState: T) => {
    if (s.state !== newState) s.state = newState
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
    changeState,
    accumulate,
  } as const
}

export const useScanner = () => {
  const { state: accum, reset, accumulate, changeState } = useAccum<
    'none' | 'var'
  >()('none')
  const { pos, setPosFrom } = usePositionState()

  const read = (c: string): Token | undefined => {
    setPosFrom(c)
    if (whitespace.test(c)) {
      if (accum.state === 'var') {
        const a = reset()
        return {
          kind: 'var',
          value: a.accum,
          line: a.pos.line,
          column: a.pos.col,
        }
      }
      return undefined
    }

    if (c === '(' || c === ')') {
      return {
        kind: 'paren',
        value: c,
        line: pos.line,
        column: pos.col,
      }
    }

    if (c === '.') {
      return {
        kind: 'dot',
        value: '.',
        line: pos.line,
        column: pos.col,
      }
    }

    if (c === '\\') {
      return {
        kind: 'backslash',
        value: c,
        line: pos.line,
        column: pos.col,
      }
    }

    if (c === '=') {
      return {
        kind: 'equals',
        value: c,
        line: pos.line,
        column: pos.col,
      }
    }

    if (c !== '') {
      changeState('var')
      accumulate(c, pos)
    }

    return undefined
  }

  return { pos, read } as const
}
