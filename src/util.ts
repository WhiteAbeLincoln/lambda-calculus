export const useState = <T extends string>(initState: T) => {
  const s = {
    value: initState,
  }

  const setState = (newState: T) => {
    if (s.value !== newState) s.value = newState
  }

  return {
    state: s as Readonly<typeof s>,
    setState,
  }
}

/** Discriminates a tagged union given tag key and value */
export type DiscriminateUnion<
  Union,
  TagKey extends keyof Union,
  TagValue extends Union[TagKey]
> = Union extends Record<TagKey, TagValue> ? Union : never

export const useDeferred = <T = never>(): readonly [
  promise: Promise<T>,
  resolve: (value: T | PromiseLike<T>) => void,
  reject: (err?: any) => void,
] => {
  let resolve: (value: T | PromiseLike<T>) => void
  let reject: (value: T) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return [promise, resolve!, reject!] as const
}

export const arrEquals = <T>(Eq: (x: T, y: T) => boolean) => (
  xs: T[],
  ys: T[],
) => xs.length === ys.length && xs.every((v, i) => Eq(v, ys[i]))
