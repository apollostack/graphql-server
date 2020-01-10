import { isReferenceType, isValueType } from "./types"

const value = `a value type`
const reference = `a reference type`

describe('value and reference types', () => {
  it.each `
    test                   | kind
    ${''}                  | ${value}
    ${'hello'}             | ${value}
    ${new String('')}      | ${reference}
    ${new String('hello')} | ${reference}
    ${0}                   | ${value}
    ${new Number(0)}       | ${reference}
    ${Infinity}            | ${value}
    ${10}                  | ${value}
    ${NaN}                 | ${value}
    ${true}                | ${value}
    ${false}               | ${value}
    ${Symbol()}            | ${value}
    ${null}                | ${value}
    ${void 0}              | ${value}
    ${undefined}           | ${value}
    ${{}}                  | ${reference}
    ${() => {}}            | ${reference}
    ${it}                  | ${reference}
  ` ('$test is $kind', ({ test, kind }) => {
    expect(isReferenceType(test)).toBe(kind === reference)
    expect(isValueType(test)).toBe(kind === value)
  })
})
