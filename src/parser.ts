/**
 * Grammar for lambda-calculus
 *
 * t ::=     # terms
 *    x      # variable, where x is a string of lowercase letters
 *    \x.t   # abstraction
 *    t t    # application
 */

import { useScanner } from './scanner'


type NodeKind = 'variable' | 'abstraction' | 'application'

export interface Node {
  startPos: number
  endPos: number
  kind: NodeKind
}

export interface VariableNode extends Node {
  kind: 'variable'
  name: string
}

export interface AbstractionNode extends Node {
  kind: 'abstraction'
  term: Term
  variable: VariableNode
}

export interface ApplicationNode extends Node {
  kind: 'application'
  left: Term
  right: Term
}

export type Term = VariableNode | AbstractionNode | ApplicationNode

export const streamParser = async (stream: AsyncIterable<Buffer>) => {
  const { read } = useScanner()
  for await (const buff of stream) {
    const chars = buff.toString('utf8')
    if (chars === '') break
    for (const char of chars) {
      const tok = read(char)
      console.log(tok)
    }
  }
}

streamParser(process.stdin)
