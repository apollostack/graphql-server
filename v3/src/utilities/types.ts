export type AnyFunc = (...args: any[]) => any

export type ValueType = string | number | bigint | boolean | symbol | null | undefined
export const isValueType = (o: any): o is ValueType => !isReferenceType(o)

export type ReferenceType = object | AnyFunc
export const isReferenceType = (o: any): o is ReferenceType => {
  if (o === null) return false
  const type = typeof o
  return (type === 'object' || type === 'function')
}

export const isTemplateStringsArray = (o: any): o is TemplateStringsArray =>
  Array.isArray(o) && (o as any).raw

export interface Constructor<T> {
  new(...args: any[]): T
}

export interface Class<T> extends Constructor<T> {
  prototype: T
}
