import { fail, FailureMode, Failure, Message } from "./fail";
import { Class, AnyFunc } from "../utilities/types";

const E_GUARD = fail('GUARD')
const E_CHECK = fail('CHECK')

export type Comparison = '<' | '>' | '==' | '===' | '!=' | '!==' | '<=' | '>='
const COMPARE = {
  '<': (lhs: any, rhs: any) => lhs < rhs,
  '>': (lhs: any, rhs: any) => lhs > rhs,
  '==': (lhs: any, rhs: any) => lhs == rhs,
  '===': (lhs: any, rhs: any) => lhs === rhs,
  '!=': (lhs: any, rhs: any) => lhs != rhs,
  '!==': (lhs: any, rhs: any) => lhs !== rhs,
  '<=': (lhs: any, rhs: any) => lhs <= rhs,
  '>=': (lhs: any, rhs: any) => lhs >= rhs,
}

export type ToThrow = FailureMode<any, any> | Failure<any, any>

function panic(toThrow: ToThrow, ...messages: (Message<any> | [])[]): never {
  let failure = 'create' in toThrow ? toThrow : toThrow()
  for (const m of messages) {
    if (Array.isArray(m) && m.length)
      failure = failure.msg(...(m as any))
  }
  throw failure.create()
}

export function guard(condition: any, failure: ToThrow = E_GUARD, ...message: Message<any> | []): asserts condition {
  if (!condition) {
    panic(failure, message, ['Guard failed'])
  }
}

export function check(lhs: any, op: Comparison, rhs: any, failure: ToThrow = E_CHECK, ...message: Message<any> | []): boolean {
  if (op in COMPARE && COMPARE[op](lhs, rhs)) return true
  panic(failure, message, [`Check failed: ${lhs} ${op} ${rhs}`])
}

check.instance = <R>(lhs: any, cls: Class<R>, failure: ToThrow = E_CHECK, ...message: Message<any> | []): asserts lhs is R => {
  if (!(lhs instanceof cls)) {
    panic(failure, message, [`Check failed: ${lhs} instanceof ${cls.name}`])
  }
}

check.exists = (o: any, failure: ToThrow = E_CHECK, ...message: Message<any> | []): o is Exclude<any, null | undefined> => {
  if (o == null) {
    panic(failure, message, [`Check failed: ${o} exists`])
  }
  return true
}

check.string = (o: any, failure: ToThrow = E_CHECK, ...message: Message<any> | []): o is string => {
  if (typeof o !== "string") {
    panic(failure, message, [`Check failed: ${String(o)} is string`])
  }
  return true
}

check.number = (o: any, failure: ToThrow = E_CHECK, ...message: Message<any> | []): o is number => {
  if (typeof o !== "number") {
    panic(failure, message, [`Check failed: ${String(o)} is number`])
  }
  return true
}

check.boolean = (o: any, failure: ToThrow = E_CHECK, ...message: Message<any> | []): o is boolean => {
  if (typeof o !== "boolean") {
    panic(failure, message, [`Check failed: ${String(o)} is boolean`])
  }
  return true
}

check.symbol = (o: any, failure: ToThrow = E_CHECK, ...message: Message<any> | []): o is symbol => {
  if (typeof o !== "symbol") {
    panic(failure, message, [`Check failed: ${String(o)} is symbol`])
  }
  return true
}

check.undefined = (o: any, failure: ToThrow = E_CHECK, ...message: Message<any> | []): o is undefined => {
  if (typeof o !== "undefined") {
    panic(failure, message, [`Check failed: ${String(o)} is undefined`])
  }
  return true
}

check.object = (o: any, failure: ToThrow = E_CHECK, ...message: Message<any> | []): o is object => {
  if (!o || typeof o !== "object") {
    panic(failure, message, [`Check failed: ${String(o)} is object`])
  }
  return true
}

check.function = (o: any, failure: ToThrow = E_CHECK, ...message: Message<any> | []): o is AnyFunc => {
  if (typeof o !== "function") {
    panic(failure, message, [`Check failed: ${String(o)} is function`])
  }
  return true
}
