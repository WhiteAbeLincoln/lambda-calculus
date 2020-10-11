export type Info = {
  filen: string
  line: number
  column: number
}

export class InfoError extends Error {
  constructor(readonly info: Info, readonly msg: string) {
    super(`${showInfo(info)} - ${msg}`)
  }
}

export class InternalError extends InfoError {}

export class ParseError extends InfoError {
  constructor(info: Info|undefined, msg: string) {
    super(info ?? dummyinfo, msg)
  }
}

export const dummyinfo: Info = { filen: '', line: 0, column: 0 }
export const showInfo = (i: Info): string => `${i.filen}@${i.line}:${i.column}`
export const errorWhen = <A, B extends A>(pred: (x: A) => x is B) => (
  info: Info,
  msg: string,
  t: A,
  ErrCls: new (inf: Info, msg: string) => Error = InternalError
): Exclude<A, B> => {
  if (pred(t)) {
    throw new ErrCls(info, msg)
  }

  return t as Exclude<A, B>
}

export const errorOnUndef = errorWhen(
  <A>(x: A | undefined): x is undefined => x === undefined,
)
