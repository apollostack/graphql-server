export interface TypeCheck<T> {
  (o: any): o is T
  typeName: string
  example: T
}

export const checkString = (() => {
  const check: TypeCheck<string> = (o: any): o is string => typeof o === 'string'
  check.typeName = 'string'
  check.example = 'This is a string.'
  return check
})()
