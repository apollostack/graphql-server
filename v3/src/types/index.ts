import {
  ExecutionResultDataDefault,
  ExecutionResult,
} from "graphql/execution/execute";
export { GraphQLError } from "graphql/error";
export { GraphQLSchemaModule } from "apollo-server-core";

export type PromisifyReturnType<T extends (...args: any) => any> =
  (...args: Parameters<T>) => Promise<ReturnType<T>>;
export type NonEmptyArray<T> = [T, ...T[]];
export type ValueOrPromise<T> = T | Promise<T>;
export type WithRequired<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type VariableValues = { [key: string]: any };

/**
 * Representation of the most typical input from a client.  Typically, each
 * of these properties would be each transmitted as their own variable.
 * e.g. on HTTP GET these might each be an HTTP query-string key/value pair.
 */
export interface GraphQLRequest {
  /**
   * Despite the name, the value may be a query or a mutation, and may contain
   * multiple operations.  If multiple operations are included, the separate
   * `operationName` variable must be set to indicate which operation will be
   * executed.
   */
  query?: string;
  /**
   * When the `query` contains multiple operations, this specifies the name of
   * which operation to execute.
   */
  operationName?: string;
  variables?: VariableValues;
  extensions?: Record<string, any>;
}

export type ResponseExtensions = { extensions?: Record<string, any> };

export type GraphQLResponse =
  & ExecutionResult<ExecutionResultDataDefault>
  & ResponseExtensions;

export type GraphQLResponseWithPreExecutionErrors =
  WithRequired<GraphQLResponse, "errors">;
export type GraphQLResponseWithExecutionErrors =
  WithRequired<GraphQLResponse, "errors" | "data">;

/**
 * Type predicate that narrows `GraphQLResponse` to match the expectations
 * of a response that resulted in an error prior to execution.
 *
 * @remarks
 *
 * Pre execution errors require that the the `data` property be absent.
 *
 * Per the [GraphQL specification (June 2018, Section 7.1.2)][1]:
 *
 * > If an error was encountered before execution begins, the `data` entry
 * > should not be present in the result.
 *
 * Furthermore,
 *
 * > If the `data` entry in the response is not present, the `errors` entry in
 * > the response must not be empty. It must contain at least one error.
 *
 * [1]: https://graphql.github.io/graphql-spec/June2018/#sec-Errors
 *
 * @param response The `GraphQLResponse` received from execution.
 *
 */
export function isErrorBeforeExecution(
  response: GraphQLResponse,
): response is WithRequired<GraphQLResponse, "errors"> {
  return Array.isArray(response.errors) && typeof response.data === "undefined";
}

/**
 * Type predicate that narrows the `GraphQLResponse` to match the expectations
 * of a response which includes an error that occurred during execution.
 *
 * @remarks
 *
 * When errors occurred during execution, the `data` property must be present
 * and the `errors` list should be non-empty.  Per the [GraphQL specification
 * (June 2018, Section 7.1)][1]:
 *
 * > If the operation encountered any errors, the response map must contain an
 * > entry with key errors.
 *
 * The specification goes on to say:
 *
 * > If the operation included execution, the response map must contain an
 * > entry with key data.
 *
 * [1]: https://graphql.github.io/graphql-spec/June2018/#sec-Response-Format
 *
 * @param response The `GraphQLResponse` received from execution.
 */
export function isErrorDuringExecution(
  response: GraphQLResponse,
): response is GraphQLResponseWithExecutionErrors {
  return Array.isArray(response.errors) && typeof response.data !== "undefined";
}
