import { Class, Instance, isTemplateInvocation } from '../utilities/types'

export function fail
  (code: string): FailureMode<[]>
export function fail<P extends any[], M extends FailureMode<P, any>>
  (code: string, mode: M): M
export function fail<E extends Class<Error>>
  (code: string, Base: E): FailureMode<ConstructorParameters<E>, Instance<E>>
export function fail<E extends ErrorWithStaticCode>
  (Base: E): FailureMode<ConstructorParameters<E>, Instance<E>>
export function fail<E extends ErrorWithStaticCode>(
  codeOrBase: E | string,
  ...rest: any[]
): any {
  let code: string
  let Base: Class<Error>
  if (typeof codeOrBase === 'string') {
    code = codeOrBase
    Base = rest[1] || Error
  } else {
    Base = rest[0]
    code = codeOrBase.code
  }

  return failureMode(Base, code)
}

export type Message<P extends any[]> = [string] | [(...params: P) => string] | [TemplateStringsArray, ...any[]]

export type Fail<P extends any[], Base extends Error> = Base & {
  readonly code: string
  readonly params: P
}

export interface FailureMode<P extends any[] = [], Base extends Error = Error> {
  (...params: P): Failure<P, Base>
  readonly code: string
  class: Class<Fail<P, Base>> & (new (fromFailure: Failure<P, Base>) => Fail<P, Base>)
  msg: (
    <MoreProps>(...msg: Message<[MoreProps]>) =>
    P extends []
      ? MoreProps extends object
        ? FailureMode<[MoreProps], Base>
        : FailureMode<P, Base>
      :
    P extends [infer Props]
      ? MoreProps extends object
        ? FailureMode<[Props & MoreProps], Base>
        : FailureMode<P, Base>
      :
      FailureMode<P, Base>
  ) & ((...msg: Message<P>) => FailureMode<P, Base>)
}

export interface Failure<P extends any[]=any[], Base extends Error=Error> {
  create(): Fail<P, Base>
  readonly messages: Message<P>[]
  readonly message: string
  msg(...msg: Message<P>): Failure<P, Base>
}

export class FailureElement<P extends any[], Base extends Error> implements Failure<P, Base> {
  constructor(
    public readonly mode: FailureMode<P, Base>,
    public readonly params: P,
    public readonly messages: Message<P>[] = []) {}

  create(): Fail<P, Base> {
    return new this.mode.class(this)
  }

  format(msg: Message<P>) {
    return formatMsg(msg, this.params)
  }

  get message(): string {
    return this.messages.map(msg => this.format(msg))
      .filter(Boolean)
      .join('\n\n')
  }

  msg(...msg: any) {
    return new FailureElement(this.mode, this.params, [...this.messages, msg]) as any
  }
}

export interface ErrorWithStaticCode extends Class<Error> {
  readonly code: string
}

function formatMsg<P extends any[]>(message: Message<P>, params: P) {
  if (!message.length) return null
  const [format] = message
  if (typeof format === 'function') {
    return format(...params)
  }
  if (isTemplateInvocation(message)) return String.raw(...message)
  if (typeof format === 'string') return format
  return null
}

const FAILURE_MODE = Symbol('Failure mode')

function failureMode<B extends Class<Error>>(Base: B, code: string, messages: Message<ConstructorParameters<B>>[] = []): FailureMode<ConstructorParameters<B>, Instance<B>> {
  const FailureClass = ((Base as any)[FAILURE_MODE]?.code === code) ? (Base as any)[FAILURE_MODE].class :
    class FailureClass extends Base {
      static readonly [FAILURE_MODE] = FailureMode
      static readonly code = code
      public readonly failure: Failure<ConstructorParameters<B>, Instance<B>>
      public readonly code = code

      constructor(...args: any[]) {
        super(...args[0].params)
        this.failure = args[0]
        Object.defineProperty(this, 'message', {
          value: this.failure.message,
          configurable: false,
          writable: false,
        })
      }
    }

  function FailureMode(...args: ConstructorParameters<B>) {
    return new FailureElement(FailureMode as any, args, messages)
  }

  Object.defineProperties(FailureClass, {
    name: { value: code },
    [FAILURE_MODE]: { value: FailureMode },
  })

  Object.defineProperties(FailureMode, {
    code: { value: code },
    msg: {
      value(...message: Message<ConstructorParameters<B>>) {
        return failureMode(FailureClass, code, [...messages, message])
      }
    },
    [FAILURE_MODE]: { value: FailureMode },
    class: { value: FailureClass }
  })

  return FailureMode as any
}
