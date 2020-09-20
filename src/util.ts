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

  return {
    pos: state as Readonly<typeof state>,
    setPosFrom: (v: string) => {
      if (v === '\n') {
        state.line++
        state.col = 0
      } else {
        state.col += v.length
      }
    },
    reset: () => {
      state.line = obj.line
      state.col = obj.col
    }
  } as const

}
