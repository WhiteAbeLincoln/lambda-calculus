import { Term } from './parser/term'

export const printer = (t: Term): string => {
  switch (t.kind) {
    case 'abs': {
      return `[${printer(t.term)}]`
    }
    case 'app': {
      return `[${printer(t.left)},${printer(t.right)}]`
    }
    case 'var': {
      return `${t.idx}`
    }
  }
}
