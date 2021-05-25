import {
  GraphQLSchema,
  GraphQLObjectType,
  getNamedType,
  GraphQLField,
  defaultFieldResolver,
  GraphQLFieldResolver,
  GraphQLResolveInfo,
  ExecutionArgs,
  DocumentNode,
  ResponsePath,
  FieldNode,
  GraphQLError,
} from 'graphql';

import { Request } from 'apollo-server-env';

import { GraphQLResponse, GraphQLRequestContext } from 'apollo-server-types';
export { GraphQLResponse };

import { GraphQLObjectResolver } from '@apollographql/apollo-tools';

export type EndHandler = (...errors: Array<Error>) => void;
// A StartHandlerInvoker is a function that, given a specific GraphQLExtension,
// finds a specific StartHandler on that extension and calls it with appropriate
// arguments.
type StartHandlerInvoker<TContext = any> = (
  ext: GraphQLExtension<TContext>,
) => EndHandler | void;

export class GraphQLExtension<TContext = any> {
  public requestDidStart?(o: {
    request: Pick<Request, 'url' | 'method' | 'headers'>;
    queryString?: string;
    parsedQuery?: DocumentNode;
    operationName?: string;
    variables?: { [key: string]: any };
    persistedQueryHit?: boolean;
    persistedQueryRegister?: boolean;
    context: TContext;
    requestContext: GraphQLRequestContext<TContext>;
  }): EndHandler | void;
  public parsingDidStart?(o: { queryString: string }): EndHandler | void;
  public validationDidStart?(): EndHandler | void;
  public executionDidStart?(o: {
    executionArgs: ExecutionArgs;
  }): EndHandler | void;

  public didEncounterErrors?(errors: Array<GraphQLError>): void;

  public willSendResponse?(o: {
    graphqlResponse: GraphQLResponse;
    context: TContext;
  }): void | { graphqlResponse: GraphQLResponse; context: TContext };

  public willResolveField?(
    source: any,
    args: { [argName: string]: any },
    context: TContext,
    info: GraphQLResolveInfo,
  ): ((error: Error | null, result?: any) => void) | void;

  public format?(): [string, any] | undefined;
}

export class GraphQLExtensionStack<TContext = any> {
  public fieldResolver?: GraphQLFieldResolver<any, any>;

  private extensions: GraphQLExtension<TContext>[];

  constructor(extensions: GraphQLExtension<TContext>[]) {
    this.extensions = extensions;
  }

  public requestDidStart(o: {
    request: Pick<Request, 'url' | 'method' | 'headers'>;
    queryString?: string;
    parsedQuery?: DocumentNode;
    operationName?: string;
    variables?: { [key: string]: any };
    persistedQueryHit?: boolean;
    persistedQueryRegister?: boolean;
    context: TContext;
    extensions?: Record<string, any>;
    requestContext: GraphQLRequestContext<TContext>;
  }): EndHandler {
    return this.handleDidStart(
      ext => ext.requestDidStart && ext.requestDidStart(o),
    );
  }
  public parsingDidStart(o: { queryString: string }): EndHandler {
    return this.handleDidStart(
      ext => ext.parsingDidStart && ext.parsingDidStart(o),
    );
  }
  public validationDidStart(): EndHandler {
    return this.handleDidStart(
      ext => ext.validationDidStart && ext.validationDidStart(),
    );
  }
  public executionDidStart(o: { executionArgs: ExecutionArgs }): EndHandler {
    if (o.executionArgs.fieldResolver) {
      this.fieldResolver = o.executionArgs.fieldResolver;
    }
    return this.handleDidStart(
      ext => ext.executionDidStart && ext.executionDidStart(o),
    );
  }

  public didEncounterErrors(errors: Array<GraphQLError>) {
    this.extensions.forEach(extension => {
      if (extension.didEncounterErrors) {
        extension.didEncounterErrors(errors);
      }
    });
  }

  public willSendResponse(o: {
    graphqlResponse: GraphQLResponse;
    context: TContext;
  }): { graphqlResponse: GraphQLResponse; context: TContext } {
    let reference = o;
    // Reverse the array, since this is functions as an end handler
    [...this.extensions].reverse().forEach(extension => {
      if (extension.willSendResponse) {
        const result = extension.willSendResponse(reference);
        if (result) {
          reference = result;
        }
      }
    });
    return reference;
  }

  public willResolveField(
    source: any,
    args: { [argName: string]: any },
    context: TContext,
    info: GraphQLResolveInfo,
  ) {
    const handlers = this.extensions
      .map(
        extension =>
          extension.willResolveField &&
          extension.willResolveField(source, args, context, info),
      )
      .filter(x => x)
      // Reverse list so that handlers "nest", like in handleDidStart.
      .reverse() as ((error: Error | null, result?: any) => void)[];

    return (error: Error | null, result?: any) => {
      for (const handler of handlers) {
        handler(error, result);
      }
    };
  }

  public format() {
    return (this.extensions
      .map(extension => extension.format && extension.format())
      .filter(x => x) as [string, any][]).reduce(
      (extensions, [key, value]) => Object.assign(extensions, { [key]: value }),
      {},
    );
  }

  private handleDidStart(startInvoker: StartHandlerInvoker): EndHandler {
    const endHandlers: EndHandler[] = [];
    this.extensions.forEach(extension => {
      // Invoke the start handler, which may return an end handler.
      try {
        const endHandler = startInvoker(extension);
        if (endHandler) {
          endHandlers.push(endHandler);
        }
      } catch (error) {
        console.error(error);
      }
    });
    return (...errors: Array<Error>) => {
      // We run end handlers in reverse order of start handlers. That way, the
      // first handler in the stack "surrounds" the entire event's process
      // (helpful for tracing/reporting!)
      endHandlers.reverse();
      for (const endHandler of endHandlers) {
        try {
          endHandler(...errors);
        } catch (error) {
          console.error(error);
        }
      }
    };
  }
}

export function enableGraphQLExtensions(
  schema: GraphQLSchema & { _extensionsEnabled?: boolean },
) {
  if (schema._extensionsEnabled) {
    return schema;
  }
  schema._extensionsEnabled = true;

  forEachField(schema, wrapField);

  return schema;
}

function wrapField(field: GraphQLField<any, any>): void {
  const fieldResolver = field.resolve;

  field.resolve = (source, args, context, info) => {
    // This is a bit of a hack, but since `ResponsePath` is a linked list,
    // a new object gets created every time a path segment is added.
    // So we can use that to share our `whenObjectResolved` promise across
    // all field resolvers for the same object.
    const parentPath = info.path.prev as ResponsePath & {
      __fields?: Record<string, ReadonlyArray<FieldNode>>;
      __whenObjectResolved?: Promise<any>;
    };

    const extensionStack = context && context._extensionStack;
    const handler =
      (extensionStack &&
        extensionStack.willResolveField(source, args, context, info)) ||
      ((_err: Error | null, _result?: any) => {
        /* do nothing */
      });

    const resolveObject: GraphQLObjectResolver<
      any,
      any
    > = (info.parentType as any).resolveObject;

    let whenObjectResolved: Promise<any> | undefined;

    if (parentPath && resolveObject) {
      if (!parentPath.__fields) {
        parentPath.__fields = {};
      }

      parentPath.__fields[info.fieldName] = info.fieldNodes;

      whenObjectResolved = parentPath.__whenObjectResolved;
      if (!whenObjectResolved) {
        // Use `Promise.resolve().then()` to delay executing
        // `resolveObject()` so we can collect all the fields first.
        whenObjectResolved = Promise.resolve().then(() => {
          return resolveObject(source, parentPath.__fields!, context, info);
        });
        parentPath.__whenObjectResolved = whenObjectResolved;
      }
    }

    try {
      // If no resolver has been defined for a field, use either the configured
      // field resolver or the default field resolver
      // (which matches the behavior of graphql-js when there is no explicit
      // resolve function defined).
      // XXX: Can't this be pulled up to the top of `wrapField` and only
      // assigned once? It seems `extensionStack.fieldResolver` isn't set
      // anywhere?
      const actualFieldResolver =
        fieldResolver ||
        (extensionStack && extensionStack.fieldResolver) ||
        defaultFieldResolver;

      let result: any;
      if (whenObjectResolved) {
        result = whenObjectResolved.then((resolvedObject: any) => {
          return actualFieldResolver(resolvedObject, args, context, info);
        });
      } else {
        result = actualFieldResolver(source, args, context, info);
      }

      // Call the stack's handlers either immediately (if result is not a
      // Promise) or once the Promise is done. Then return that same
      // maybe-Promise value.
      whenResultIsFinished(result, handler);
      return result;
    } catch (error) {
      // Normally it's a bad sign to see an error both handled and
      // re-thrown. But it is useful to allow extensions to track errors while
      // still handling them in the normal GraphQL way.
      handler(error);
      throw error;
    }
  };
}

function isPromise(x: any): boolean {
  return x && typeof x.then === 'function';
}

// Given result (which may be a Promise or an array some of whose elements are
// promises) Promises, set up 'callback' to be invoked when result is fully
// resolved.
function whenResultIsFinished(
  result: any,
  callback: (err: Error | null, result?: any) => void,
) {
  if (isPromise(result)) {
    result.then((r: any) => callback(null, r), (err: Error) => callback(err));
  } else if (Array.isArray(result)) {
    if (result.some(isPromise)) {
      Promise.all(result).then(
        (r: any) => callback(null, r),
        (err: Error) => callback(err),
      );
    } else {
      callback(null, result);
    }
  } else {
    callback(null, result);
  }
}

function forEachField(schema: GraphQLSchema, fn: FieldIteratorFn): void {
  const typeMap = schema.getTypeMap();
  Object.keys(typeMap).forEach(typeName => {
    const type = typeMap[typeName];

    if (
      !getNamedType(type).name.startsWith('__') &&
      type instanceof GraphQLObjectType
    ) {
      const fields = type.getFields();
      Object.keys(fields).forEach(fieldName => {
        const field = fields[fieldName];
        fn(field, typeName, fieldName);
      });
    }
  });
}

export type FieldIteratorFn = (
  fieldDef: GraphQLField<any, any>,
  typeName: string,
  fieldName: string,
) => void;
