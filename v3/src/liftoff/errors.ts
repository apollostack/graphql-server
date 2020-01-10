import { Class } from '../utilities/types'

export interface Thrower<C extends Class<Error>> {
  /**
   * Create and throw an error.
   */
  (...args: ConstructorParameters<C>): never

  readonly code: string

  /**
   * Reference to the underlying class.
   */
  readonly class: C
}

export interface ErrorWithStaticCode extends Class<Error> {
  readonly code: string
}

export function throws(code: string, message: string, Base?: Class<Error>): Thrower<Class<Error>>
export function throws<E extends ErrorWithStaticCode>(ErrorClass: E): Thrower<E>

export function throws<E extends ErrorWithStaticCode>(
  codeOrClass: E | string,
  defaultMessage?: string,
  Base: Class<Error> = Error
): any {
  const ErrorClass = typeof codeOrClass === 'function'
    ? codeOrClass
    : class extends Base {
      static readonly code = codeOrClass
      constructor(message?: string, ...rest: any[]) {
        super(`${message ?? defaultMessage} (${codeOrClass})`, ...rest)
      }
    }

    if (!('code' in ErrorClass.prototype))
      Object.defineProperty(ErrorClass.prototype, 'code', {
        value: ErrorClass.code, writable: true
      })

  return Object.assign(
    function(...args: ConstructorParameters<E>): never {
      throw new ErrorClass(...args)
    }, { class: ErrorClass, code: ErrorClass.code }) as Thrower<E>
}

