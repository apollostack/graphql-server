import {
  GraphQLSchema,
  GraphQLFieldResolver,
  specifiedRules,
  DocumentNode,
  getOperationAST,
  ExecutionArgs,
  GraphQLError,
  GraphQLFormattedError,
  validate as graphqlValidate,
  parse as graphqlParse,
  execute as graphqlExecute,
} from 'graphql';
import {
  GraphQLExtension,
  GraphQLExtensionStack,
  enableGraphQLExtensions,
} from 'graphql-extensions';
import { DataSource } from 'apollo-datasource';
import { PersistedQueryOptions } from './graphqlOptions';
import {
  symbolExecutionDispatcherWillResolveField,
  enablePluginsForSchemaResolvers,
  symbolUserFieldResolver,
} from "./utils/schemaInstrumentation"
import {
  ApolloError,
  fromGraphQLError,
  SyntaxError,
  ValidationError,
  PersistedQueryNotSupportedError,
  PersistedQueryNotFoundError,
  formatApolloErrors,
} from 'apollo-server-errors';
import {
  GraphQLRequest,
  GraphQLResponse,
  GraphQLRequestContext,
  GraphQLExecutor,
  GraphQLExecutionResult,
  InvalidGraphQLRequestError,
  ValidationRule,
  WithRequired,
} from 'apollo-server-types';
import {
  ApolloServerPlugin,
  GraphQLRequestListener,
  GraphQLRequestContextDidResolveSource,
  GraphQLRequestContextExecutionDidStart,
  GraphQLRequestContextResponseForOperation,
  GraphQLRequestContextDidResolveOperation,
  GraphQLRequestContextParsingDidStart,
  GraphQLRequestContextValidationDidStart,
  GraphQLRequestContextWillSendResponse,
  GraphQLRequestContextDidEncounterErrors,
  GraphQLRequestExecutionListener,
} from 'apollo-server-plugin-base';

import { Dispatcher } from './utils/dispatcher';
import {
  InMemoryLRUCache,
  KeyValueCache,
  PrefixingKeyValueCache,
} from 'apollo-server-caching';
import { GraphQLParseOptions } from 'graphql-tools';

export {
  GraphQLRequest,
  GraphQLResponse,
  GraphQLRequestContext,
  InvalidGraphQLRequestError,
};

import createSHA from './utils/createSHA';
import { HttpQueryError } from './runHttpQuery';

export const APQ_CACHE_PREFIX = 'apq:';

function computeQueryHash(query: string) {
  return createSHA('sha256')
    .update(query)
    .digest('hex');
}

export interface GraphQLRequestPipelineConfig<TContext> {
  schema: GraphQLSchema;

  rootValue?: ((document: DocumentNode) => any) | any;
  validationRules?: ValidationRule[];
  executor?: GraphQLExecutor;
  fieldResolver?: GraphQLFieldResolver<any, TContext>;

  dataSources?: () => DataSources<TContext>;

  extensions?: Array<() => GraphQLExtension>;
  persistedQueries?: PersistedQueryOptions;

  formatError?: (error: GraphQLError) => GraphQLFormattedError;
  formatResponse?: (
    response: GraphQLResponse,
    requestContext: GraphQLRequestContext<TContext>,
  ) => GraphQLResponse | null;

  plugins?: ApolloServerPlugin[];
  documentStore?: InMemoryLRUCache<DocumentNode>;

  parseOptions?: GraphQLParseOptions;
}

export type DataSources<TContext> = {
  [name: string]: DataSource<TContext>;
};

type Mutable<T> = { -readonly [P in keyof T]: T[P] };

/**
 * We attach this symbol to the constructor of extensions to mark that we've
 * already warned about the deprecation of the `graphql-extensions` API for that
 * particular definition.
 */
const symbolExtensionDeprecationDone =
  Symbol("apolloServerExtensionDeprecationDone");

export async function processGraphQLRequest<TContext>(
  config: GraphQLRequestPipelineConfig<TContext>,
  requestContext: Mutable<GraphQLRequestContext<TContext>>,
): Promise<GraphQLResponse> {
  // For legacy reasons, this exported method may exist without a `logger` on
  // the context.  We'll need to make sure we account for that, even though
  // all of our own machinery will certainly set it now.
  const logger = requestContext.logger || console;

  // If request context's `metrics` already exists, preserve it, but _ensure_ it
  // exists there and shorthand it for use throughout this function.
  const metrics = requestContext.metrics =
    requestContext.metrics || Object.create(null);

  const extensionStack = initializeExtensionStack();
  (requestContext.context as any)._extensionStack = extensionStack;

  const dispatcher = initializeRequestListenerDispatcher();
  await initializeDataSources();

  const request = requestContext.request;

  let { query, extensions } = request;

  let queryHash: string;

  let persistedQueryCache: KeyValueCache | undefined;
  metrics.persistedQueryHit = false;
  metrics.persistedQueryRegister = false;

  if (extensions && extensions.persistedQuery) {
    // It looks like we've received a persisted query. Check if we
    // support them.
    if (!config.persistedQueries || !config.persistedQueries.cache) {
      // We are returning to `runHttpQuery` to preserve legacy behavior while
      // still delivering observability to the `didEncounterErrors` hook.
      // This particular error will _not_ trigger `willSendResponse`.
      // See comment on `emitErrorAndThrow` for more details.
      return await emitErrorAndThrow(new PersistedQueryNotSupportedError());
    } else if (extensions.persistedQuery.version !== 1) {
      // We are returning to `runHttpQuery` to preserve legacy behavior while
      // still delivering observability to the `didEncounterErrors` hook.
      // This particular error will _not_ trigger `willSendResponse`.
      // See comment on `emitErrorAndThrow` for more details.
      return await emitErrorAndThrow(
        new InvalidGraphQLRequestError('Unsupported persisted query version'));
    }

    // We'll store a reference to the persisted query cache so we can actually
    // do the write at a later point in the request pipeline processing.
    persistedQueryCache = config.persistedQueries.cache;

    // This is a bit hacky, but if `config` came from direct use of the old
    // apollo-server 1.0-style middleware (graphqlExpress etc, not via the
    // ApolloServer class), it won't have been converted to
    // PrefixingKeyValueCache yet.
    if (!(persistedQueryCache instanceof PrefixingKeyValueCache)) {
      persistedQueryCache = new PrefixingKeyValueCache(
        persistedQueryCache,
        APQ_CACHE_PREFIX,
      );
    }

    queryHash = extensions.persistedQuery.sha256Hash;

    if (query === undefined) {
      query = await persistedQueryCache.get(queryHash);
      if (query) {
        metrics.persistedQueryHit = true;
      } else {
        // We are returning to `runHttpQuery` to preserve legacy behavior while
        // still delivering observability to the `didEncounterErrors` hook.
        // This particular error will _not_ trigger `willSendResponse`.
        // See comment on `emitErrorAndThrow` for more details.
        return await emitErrorAndThrow(new PersistedQueryNotFoundError());
      }
    } else {
      const computedQueryHash = computeQueryHash(query);

      // The provided hash must exactly match the SHA-256 hash of
      // the query string. This prevents hash hijacking, where a
      // new and potentially malicious query is associated with
      // an existing hash.
      if (queryHash !== computedQueryHash) {
        // We are returning to `runHttpQuery` to preserve legacy behavior while
        // still delivering observability to the `didEncounterErrors` hook.
        // This particular error will _not_ trigger `willSendResponse`.
        // See comment on `emitErrorAndThrow` for more details.
        return await emitErrorAndThrow(
          new InvalidGraphQLRequestError('provided sha does not match query'));
      }

      // We won't write to the persisted query cache until later.
      // Deferring the writing gives plugins the ability to "win" from use of
      // the cache, but also have their say in whether or not the cache is
      // written to (by interrupting the request with an error).
      metrics.persistedQueryRegister = true;
    }
  } else if (query) {
    // FIXME: We'll compute the APQ query hash to use as our cache key for
    // now, but this should be replaced with the new operation ID algorithm.
    queryHash = computeQueryHash(query);
  } else {
    // We are returning to `runHttpQuery` to preserve legacy behavior
    // while still delivering observability to the `didEncounterErrors` hook.
    // This particular error will _not_ trigger `willSendResponse`.
    // See comment on `emitErrorAndThrow` for more details.
    return await emitErrorAndThrow(
      new InvalidGraphQLRequestError('Must provide query string.'));
  }

  requestContext.queryHash = queryHash;
  requestContext.source = query;

  // Let the plugins know that we now have a STRING of what we hope will
  // parse and validate into a document we can execute on.  Unless we have
  // retrieved this from our APQ cache, there's no guarantee that it is
  // syntactically correct, so this string should not be trusted as a valid
  // document until after it's parsed and validated.
  await dispatcher.invokeHookAsync(
    'didResolveSource',
    requestContext as GraphQLRequestContextDidResolveSource<TContext>,
  );

  const requestDidEnd = extensionStack.requestDidStart({
    request: request.http!,
    queryString: request.query,
    operationName: request.operationName,
    variables: request.variables,
    extensions: request.extensions,
    context: requestContext.context,
    persistedQueryHit: metrics.persistedQueryHit,
    persistedQueryRegister: metrics.persistedQueryRegister,
    requestContext: requestContext as WithRequired<
      typeof requestContext,
      'metrics' | 'queryHash'
    >,
  });

  try {
    // If we're configured with a document store (by default, we are), we'll
    // utilize the operation's hash to lookup the AST from the previously
    // parsed-and-validated operation.  Failure to retrieve anything from the
    // cache just means we're committed to doing the parsing and validation.
    if (config.documentStore) {
      try {
        requestContext.document = await config.documentStore.get(queryHash);
      } catch (err) {
        logger.warn(
          'An error occurred while attempting to read from the documentStore. '
          + (err && err.message) || err,
        );
      }
    }

    // If we still don't have a document, we'll need to parse and validate it.
    // With success, we'll attempt to save it into the store for future use.
    if (!requestContext.document) {
      const parsingDidEnd = await dispatcher.invokeDidStartHook(
        'parsingDidStart',
        requestContext as GraphQLRequestContextParsingDidStart<TContext>,
      );

      try {
        requestContext.document = parse(query, config.parseOptions);
        parsingDidEnd();
      } catch (syntaxError) {
        parsingDidEnd(syntaxError);
        return await sendErrorResponse(syntaxError, SyntaxError);
      }

      const validationDidEnd = await dispatcher.invokeDidStartHook(
        'validationDidStart',
        requestContext as GraphQLRequestContextValidationDidStart<TContext>,
      );

      const validationErrors = validate(requestContext.document);

      if (validationErrors.length === 0) {
        validationDidEnd();
      } else {
        validationDidEnd(validationErrors);
        return await sendErrorResponse(validationErrors, ValidationError);
      }

      if (config.documentStore) {
        // The underlying cache store behind the `documentStore` returns a
        // `Promise` which is resolved (or rejected), eventually, based on the
        // success or failure (respectively) of the cache save attempt.  While
        // it's certainly possible to `await` this `Promise`, we don't care about
        // whether or not it's successful at this point.  We'll instead proceed
        // to serve the rest of the request and just hope that this works out.
        // If it doesn't work, the next request will have another opportunity to
        // try again.  Errors will surface as warnings, as appropriate.
        //
        // While it shouldn't normally be necessary to wrap this `Promise` in a
        // `Promise.resolve` invocation, it seems that the underlying cache store
        // is returning a non-native `Promise` (e.g. Bluebird, etc.).
        Promise.resolve(
          config.documentStore.set(queryHash, requestContext.document),
        ).catch(err =>
          logger.warn(
            'Could not store validated document. ' +
            (err && err.message) || err
          )
        );
      }
    }

    // FIXME: If we want to guarantee an operation has been set when invoking
    // `willExecuteOperation` and executionDidStart`, we need to throw an
    // error here and not leave this to `buildExecutionContext` in
    // `graphql-js`.
    const operation = getOperationAST(
      requestContext.document,
      request.operationName,
    );

    requestContext.operation = operation || undefined;
    // We'll set `operationName` to `null` for anonymous operations.
    requestContext.operationName =
      (operation && operation.name && operation.name.value) || null;

    try {
      await dispatcher.invokeHookAsync(
        'didResolveOperation',
        requestContext as GraphQLRequestContextDidResolveOperation<TContext>,
      );
    } catch (err) {
      // XXX: The HttpQueryError is special-cased here because we currently
      // depend on `throw`-ing an error from the `didResolveOperation` hook
      // we've implemented in `runHttpQuery.ts`'s `checkOperationPlugin`:
      // https://git.io/fj427.  This could be perceived as a feature, but
      // for the time-being this just maintains existing behavior for what
      // happens when `throw`-ing an `HttpQueryError` in `didResolveOperation`.
      if (err instanceof HttpQueryError) {
        // In order to report this error reliably to the request pipeline, we'll
        // have to regenerate it with the original error message and stack for
        // the purposes of the `didEncounterErrors` life-cycle hook (which
        // expects `GraphQLError`s), but still throw the `HttpQueryError`, so
        // the appropriate status code is enforced by `runHttpQuery.ts`.
        const graphqlError = new GraphQLError(err.message);
        graphqlError.stack = err.stack;
        await didEncounterErrors([graphqlError]);
        throw err;
      }
      return await sendErrorResponse(err);
    }

    // Now that we've gone through the pre-execution phases of the request
    // pipeline, and given plugins appropriate ability to object (by throwing
    // an error) and not actually write, we'll write to the cache if it was
    // determined earlier in the request pipeline that we should do so.
    if (metrics.persistedQueryRegister && persistedQueryCache) {
      // While it shouldn't normally be necessary to wrap this `Promise` in a
      // `Promise.resolve` invocation, it seems that the underlying cache store
      // is returning a non-native `Promise` (e.g. Bluebird, etc.).
      Promise.resolve(
        persistedQueryCache.set(
          queryHash,
          query,
          config.persistedQueries &&
            typeof config.persistedQueries.ttl !== 'undefined'
            ? {
                ttl: config.persistedQueries.ttl,
              }
            : Object.create(null),
        ),
      ).catch(logger.warn);
    }

    let response: GraphQLResponse | null = await dispatcher.invokeHooksUntilNonNull(
      'responseForOperation',
      requestContext as GraphQLRequestContextResponseForOperation<TContext>,
    );
    if (response == null) {
      // This execution dispatcher code is duplicated in `pluginTestHarness`
      // right now.

      const executionListeners: GraphQLRequestExecutionListener<TContext>[] = [];
      dispatcher.invokeHookSync(
        'executionDidStart',
        requestContext as GraphQLRequestContextExecutionDidStart<TContext>,
      ).forEach(executionListener => {
        if (typeof executionListener === 'function') {
          executionListeners.push({
            executionDidEnd: executionListener,
          });
        } else if (typeof executionListener === 'object') {
          executionListeners.push(executionListener);
        }
      });

      const executionDispatcher = new Dispatcher(executionListeners);

      // Create a callback that will trigger the execution dispatcher's
      // `willResolveField` hook.  We will attach this to the context on a
      // symbol so it can be invoked by our `wrapField` method during execution.
      const invokeWillResolveField: GraphQLRequestExecutionListener<
        TContext
      >['willResolveField'] = (...args) =>
          executionDispatcher.invokeDidStartHook('willResolveField', ...args);

      Object.defineProperty(
        requestContext.context,
        symbolExecutionDispatcherWillResolveField,
        { value: invokeWillResolveField }
      );

      // If the user has provided a custom field resolver, we will attach
      // it to the context so we can still invoke it after we've wrapped the
      // fields with `wrapField` within `enablePluginsForSchemaResolvers` of
      // the `schemaInstrumentation` module.
      if (config.fieldResolver) {
        Object.defineProperty(
          requestContext.context,
          symbolUserFieldResolver,
          { value: config.fieldResolver }
        );
      }

      // If the schema is already enabled, this is a no-op.  Otherwise, the
      // schema will be augmented so it is able to invoke willResolveField.
      enablePluginsForSchemaResolvers(config.schema);

      try {
        const result = await execute(
          requestContext as GraphQLRequestContextExecutionDidStart<TContext>,
        );

        if (result.errors) {
          await didEncounterErrors(result.errors);
        }

        response = {
          ...result,
          errors: result.errors ? formatErrors(result.errors) : undefined,
        };

        executionDispatcher.reverseInvokeHookSync("executionDidEnd");
      } catch (executionError) {
        executionDispatcher.reverseInvokeHookSync("executionDidEnd", executionError);
        return await sendErrorResponse(executionError);
      }
    }

    const formattedExtensions = extensionStack.format();
    if (Object.keys(formattedExtensions).length > 0) {
      response.extensions = formattedExtensions;
    }

    if (config.formatResponse) {
      const formattedResponse: GraphQLResponse | null = config.formatResponse(
        response,
        requestContext,
      );
      if (formattedResponse != null) {
        response = formattedResponse;
      }
    }

    return sendResponse(response);
  } finally {
    requestDidEnd();
  }

  function parse(
    query: string,
    parseOptions?: GraphQLParseOptions,
  ): DocumentNode {
    const parsingDidEnd = extensionStack.parsingDidStart({
      queryString: query,
    });

    try {
      return graphqlParse(query, parseOptions);
    } finally {
      parsingDidEnd();
    }
  }

  function validate(document: DocumentNode): ReadonlyArray<GraphQLError> {
    let rules = specifiedRules;
    if (config.validationRules) {
      rules = rules.concat(config.validationRules);
    }

    const validationDidEnd = extensionStack.validationDidStart();

    try {
      return graphqlValidate(config.schema, document, rules);
    } finally {
      validationDidEnd();
    }
  }

  async function execute(
    requestContext: GraphQLRequestContextExecutionDidStart<TContext>,
  ): Promise<GraphQLExecutionResult> {
    const { request, document } = requestContext;

    const executionArgs: ExecutionArgs = {
      schema: config.schema,
      document,
      rootValue:
        typeof config.rootValue === 'function'
          ? config.rootValue(document)
          : config.rootValue,
      contextValue: requestContext.context,
      variableValues: request.variables,
      operationName: request.operationName,
      fieldResolver: config.fieldResolver,
    };

    const executionDidEnd = extensionStack.executionDidStart({
      executionArgs,
    });

    try {
      if (config.executor) {
        // XXX Nothing guarantees that the only errors thrown or returned
        // in result.errors are GraphQLErrors, even though other code
        // (eg ApolloServerPluginUsageReporting) assumes that.
        return await config.executor(requestContext);
      } else {
        return await graphqlExecute(executionArgs);
      }
    } finally {
      executionDidEnd();
    }
  }

  async function sendResponse(
    response: GraphQLResponse,
  ): Promise<GraphQLResponse> {
    // We override errors, data, and extensions with the passed in response,
    // but keep other properties (like http)
    requestContext.response = extensionStack.willSendResponse({
      graphqlResponse: {
        ...requestContext.response,
        errors: response.errors,
        data: response.data,
        extensions: response.extensions,
      },
      context: requestContext.context,
    }).graphqlResponse;
    await dispatcher.invokeHookAsync(
      'willSendResponse',
      requestContext as GraphQLRequestContextWillSendResponse<TContext>,
    );
    return requestContext.response!;
  }

  /**
   * HEREIN LIE LEGACY COMPATIBILITY
   *
   * DO NOT PERPETUATE THE USE OF THIS METHOD IN NEWLY INTRODUCED CODE.
   *
   * Report an error via `didEncounterErrors` and then `throw` it again,
   * ENTIRELY BYPASSING the rest of the request pipeline and returning
   * control to `runHttpQuery.ts`.
   *
   * Any number of other life-cycle events may not be invoked in this case.
   *
   * Prior to the introduction of this function, some errors were being thrown
   * within the request pipeline and going directly to handling within
   * the `runHttpQuery.ts` module, rather than first being reported to the
   * plugin API's `didEncounterErrors` life-cycle hook (where they are to be
   * expected!).
   *
   * @param error The error to report to the request pipeline plugins prior
   *              to being thrown.
   *
   * @throws
   *
   */
  async function emitErrorAndThrow(error: GraphQLError): Promise<never> {
    await didEncounterErrors([error]);
    throw error;
  }

  async function didEncounterErrors(errors: ReadonlyArray<GraphQLError>) {
    requestContext.errors = errors;
    extensionStack.didEncounterErrors(errors);

    return await dispatcher.invokeHookAsync(
      'didEncounterErrors',
      requestContext as GraphQLRequestContextDidEncounterErrors<TContext>,
    );
  }

  async function sendErrorResponse(
    errorOrErrors: ReadonlyArray<GraphQLError> | GraphQLError,
    errorClass?: typeof ApolloError,
  ) {
    // If a single error is passed, it should still be encapsulated in an array.
    const errors = Array.isArray(errorOrErrors)
      ? errorOrErrors
      : [errorOrErrors];

    await didEncounterErrors(errors);

    return sendResponse({
      errors: formatErrors(
        errors.map(err =>
          fromGraphQLError(
            err,
            errorClass && {
              errorClass,
            },
          ),
        ),
      ),
    });
  }

  function formatErrors(
    errors: ReadonlyArray<GraphQLError>,
  ): ReadonlyArray<GraphQLFormattedError> {
    return formatApolloErrors(errors, {
      formatter: config.formatError,
      debug: requestContext.debug,
    });
  }

  function initializeRequestListenerDispatcher(): Dispatcher<
    GraphQLRequestListener<TContext>
  > {
    const requestListeners: GraphQLRequestListener<TContext>[] = [];
    if (config.plugins) {
      for (const plugin of config.plugins) {
        if (!plugin.requestDidStart) continue;
        const listener = plugin.requestDidStart(requestContext);
        if (listener) {
          requestListeners.push(listener);
        }
      }
    }
    return new Dispatcher(requestListeners);
  }

  function initializeExtensionStack(): GraphQLExtensionStack<TContext> {
    if (config.extensions?.length) {
      // graphql-extensions adds some overhead to field resolvers.
      // Only enable extensions when at least 1 extension has been provided
      enableGraphQLExtensions(config.schema);
    }

    // If custom extension factories were provided, create per-request extension
    // objects.
    const extensions = config.extensions ? config.extensions.map(f => f()) : [];

    // Warn about usage of (deprecated) `graphql-extensions` implementations.
    // Since extensions are often provided as factory functions which
    // instantiate an extension on each request, we'll attach a symbol to the
    // constructor after we've warned to ensure that we don't do it on each
    // request.  Another option here might be to keep a `Map` of constructor
    // instances within this module, but I hope this will do the trick.
    const hasOwn = Object.prototype.hasOwnProperty;
    extensions.forEach((extension) => {
      // Using `hasOwn` just in case there is a user-land `hasOwnProperty`
      // defined on the `constructor` object.
      if (
        !extension.constructor ||
        hasOwn.call(extension.constructor, symbolExtensionDeprecationDone)
      ) {
        return;
      }

      Object.defineProperty(
        extension.constructor,
        symbolExtensionDeprecationDone,
        { value: true }
      );

      const extensionName = extension.constructor.name;
      logger.warn(
        '[deprecated] ' +
          (extensionName
            ? 'A "' + extensionName + '" '
            : 'An anonymous extension ') +
          'was defined within the "extensions" configuration for ' +
          'Apollo Server.  The API on which this extension is built ' +
          '("graphql-extensions") is being deprecated in the next major ' +
          'version of Apollo Server in favor of the new plugin API.  See ' +
          'https://go.apollo.dev/s/plugins for the documentation on how ' +
          'these plugins are to be defined and used.',
      );
    });

    return new GraphQLExtensionStack(extensions);
  }

  async function initializeDataSources() {
    if (config.dataSources) {
      const context = requestContext.context;

      const dataSources = config.dataSources();

      const initializers: any[] = [];
      for (const dataSource of Object.values(dataSources)) {
        if (dataSource.initialize) {
          initializers.push(
            dataSource.initialize({
              context,
              cache: requestContext.cache,
            })
          );
        }
      }

      await Promise.all(initializers);

      if ('dataSources' in context) {
        throw new Error(
          'Please use the dataSources config option instead of putting dataSources on the context yourself.',
        );
      }

      (context as any).dataSources = dataSources;
    }
  }
}
