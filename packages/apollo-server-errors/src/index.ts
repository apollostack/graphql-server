import { GraphQLError, GraphQLFormattedError } from 'graphql';

export class ApolloError extends Error implements GraphQLError {
  public extensions: Record<string, any>;
  readonly name;
  readonly locations;
  readonly path;
  readonly source;
  readonly positions;
  readonly nodes;
  public originalError;

  [key: string]: any;

  constructor(
    message: string,
    code?: string,
    extensions?: Record<string, any>,
  ) {
    super(message);

    // This variable was previously named `properties`, which allowed users to set
    // arbitrary properties on the ApolloError object. This use case is still supported,
    // but deprecated in favor of using the ApolloError.extensions object instead.
    // This change intends to comply with the GraphQL spec on errors. See:
    // https://github.com/graphql/graphql-spec/blob/master/spec/Section%207%20--%20Response.md#response-format
    //
    // Going forward, users should use the ApolloError.extensions object for storing
    // and reading arbitrary data on an error, as arbitrary properties on the ApolloError
    // itself won't be supported in the future.
    //
    // XXX Filter 'message' and 'extensions' specifically so they don't overwrite the class property.
    // We _could_ filter all of the class properties, but have chosen to only do
    // so if it's an issue for other users. Please feel free to open an issue if you
    // find yourself here with this exact problem.
    if (extensions) {
      Object.keys(extensions)
        .filter(keyName => keyName !== 'message' && keyName !== 'extensions')
        .forEach(key => {
          this[key] = extensions[key];
        });
    }

    // if no name provided, use the default. defineProperty ensures that it stays non-enumerable
    if (!this.name) {
      Object.defineProperty(this, 'name', { value: 'ApolloError' });
    }

    // Before the mentioned change to extensions, users could previously set the extensions
    // object by providing it as a key on the third argument to the constructor.
    // This step provides backwards compatibility for those hypothetical users.
    const userProvidedExtensions = (extensions && extensions.extensions) || null;

    this.extensions = { ...extensions, ...userProvidedExtensions, code };
  }
}

function enrichError(error: Partial<GraphQLError>, debug: boolean = false) {
  // follows similar structure to https://github.com/graphql/graphql-js/blob/master/src/error/GraphQLError.js#L145-L193
  // with the addition of name
  const expanded = Object.create(Object.getPrototypeOf(error), {
    name: {
      value: error.name,
    },
    message: {
      value: error.message,
      enumerable: true,
      writable: true,
    },
    locations: {
      value: error.locations || undefined,
      enumerable: true,
    },
    path: {
      value: error.path || undefined,
      enumerable: true,
    },
    nodes: {
      value: error.nodes || undefined,
    },
    source: {
      value: error.source || undefined,
    },
    positions: {
      value: error.positions || undefined,
    },
    originalError: {
      value: error.originalError,
    },
  });

  expanded.extensions = {
    ...error.extensions,
    code:
      (error.extensions && error.extensions.code) || 'INTERNAL_SERVER_ERROR',
    exception: {
      ...(error.extensions && error.extensions.exception),
      ...(error.originalError as any),
    },
  };

  // ensure that extensions is not taken from the originalError
  // graphql-js ensures that the originalError's extensions are hoisted
  // https://github.com/graphql/graphql-js/blob/0bb47b2/src/error/GraphQLError.js#L138
  delete expanded.extensions.exception.extensions;
  if (debug && !expanded.extensions.exception.stacktrace) {
    expanded.extensions.exception.stacktrace =
      (error.originalError &&
        error.originalError.stack &&
        error.originalError.stack.split('\n')) ||
      (error.stack && error.stack.split('\n'));
  }

  if (Object.keys(expanded.extensions.exception).length === 0) {
    // remove from printing an empty object
    delete expanded.extensions.exception;
  }

  return expanded as ApolloError;
}

export function toApolloError(
  error: Error & { extensions?: Record<string, any> },
  code: string = 'INTERNAL_SERVER_ERROR',
): Error & { extensions: Record<string, any> } {
  let err = error;
  if (err.extensions) {
    err.extensions.code = code;
  } else {
    err.extensions = { code };
  }
  return err as Error & { extensions: Record<string, any> };
}

export interface ErrorOptions {
  code?: string;
  // This declaration means it takes any "class" that has a constructor that
  // takes a single string, and should be invoked via the `new` operator.
  errorClass?: new (message: string) => ApolloError;
}

export function fromGraphQLError(error: GraphQLError, options?: ErrorOptions) {
  const copy: ApolloError =
    options && options.errorClass
      ? new options.errorClass(error.message)
      : new ApolloError(error.message);

  // copy enumerable keys
  Object.keys(error).forEach(key => {
    copy[key] = error[key];
  });

  // extensions are non enumerable, so copy them directly
  copy.extensions = {
    ...copy.extensions,
    ...error.extensions,
  };

  // Fallback on default for code
  if (!copy.extensions.code) {
    copy.extensions.code = (options && options.code) || 'INTERNAL_SERVER_ERROR';
  }

  // copy the original error, while keeping all values non-enumerable, so they
  // are not printed unless directly referenced
  Object.defineProperty(copy, 'originalError', { value: {} });
  Object.getOwnPropertyNames(error).forEach(key => {
    Object.defineProperty(copy.originalError, key, { value: error[key] });
  });

  return copy;
}

export class SyntaxError extends ApolloError {
  constructor(message: string) {
    super(message, 'GRAPHQL_PARSE_FAILED');

    Object.defineProperty(this, 'name', { value: 'SyntaxError' });
  }
}

export class ValidationError extends ApolloError {
  constructor(message: string) {
    super(message, 'GRAPHQL_VALIDATION_FAILED');

    Object.defineProperty(this, 'name', { value: 'ValidationError' });
  }
}

export class AuthenticationError extends ApolloError {
  constructor(message: string) {
    super(message, 'UNAUTHENTICATED');

    Object.defineProperty(this, 'name', { value: 'AuthenticationError' });
  }
}

export class ForbiddenError extends ApolloError {
  constructor(message: string) {
    super(message, 'FORBIDDEN');

    Object.defineProperty(this, 'name', { value: 'ForbiddenError' });
  }
}

export class PersistedQueryNotFoundError extends ApolloError {
  constructor() {
    super('PersistedQueryNotFound', 'PERSISTED_QUERY_NOT_FOUND');

    Object.defineProperty(this, 'name', {
      value: 'PersistedQueryNotFoundError',
    });
  }
}

export class PersistedQueryNotSupportedError extends ApolloError {
  constructor() {
    super('PersistedQueryNotSupported', 'PERSISTED_QUERY_NOT_SUPPORTED');

    Object.defineProperty(this, 'name', {
      value: 'PersistedQueryNotSupportedError',
    });
  }
}

export class UserInputError extends ApolloError {
  constructor(message: string, properties?: Record<string, any>) {
    super(message, 'BAD_USER_INPUT', properties);

    Object.defineProperty(this, 'name', { value: 'UserInputError' });
  }
}

export function formatApolloErrors(
  errors: Array<Error>,
  options?: {
    formatter?: (error: GraphQLError) => GraphQLFormattedError;
    debug?: boolean;
  },
): Array<ApolloError> {
  if (!options) {
    return errors.map(error => enrichError(error));
  }
  const { formatter, debug } = options;

  // Errors that occur in graphql-tools can contain an errors array that contains the errors thrown in a merged schema
  // https://github.com/apollographql/graphql-tools/blob/3d53986ca/src/stitching/errors.ts#L104-L107
  //
  // They are are wrapped in an extra GraphQL error
  // https://github.com/apollographql/graphql-tools/blob/3d53986ca/src/stitching/errors.ts#L109-L113
  // which calls:
  // https://github.com/graphql/graphql-js/blob/0a30b62964/src/error/locatedError.js#L18-L37
  // Some processing for these nested errors could be done here:
  //
  // if (Array.isArray((error as any).errors)) {
  //   (error as any).errors.forEach(e => flattenedErrors.push(e));
  // } else if (
  //   (error as any).originalError &&
  //   Array.isArray((error as any).originalError.errors)
  // ) {
  //   (error as any).originalError.errors.forEach(e => flattenedErrors.push(e));
  // } else {
  //   flattenedErrors.push(error);
  // }

  const enrichedErrors = errors.map(error => enrichError(error, debug));
  const makePrintable = error => {
    if (error instanceof Error) {
      // Error defines its `message` and other fields as non-enumerable, meaning JSON.stringigfy does not print them.
      const graphQLError = error as GraphQLFormattedError;
      return {
        message: graphQLError.message,
        ...(graphQLError.locations && { locations: graphQLError.locations }),
        ...(graphQLError.path && { path: graphQLError.path }),
        ...(graphQLError.extensions && { extensions: graphQLError.extensions }),
      };
    }
    return error;
  };

  if (!formatter) {
    return enrichedErrors;
  }

  return enrichedErrors.map(error => {
    try {
      return makePrintable(formatter(error));
    } catch (err) {
      if (debug) {
        return enrichError(err, debug);
      } else {
        // obscure error
        const newError = fromGraphQLError(
          new GraphQLError('Internal server error'),
        );
        return enrichError(newError, debug);
      }
    }
  }) as Array<ApolloError>;
}

export function hasPersistedQueryError(errors: Array<Error>): boolean {
  return Array.isArray(errors)
    ? errors.some(
        error =>
          error instanceof PersistedQueryNotFoundError ||
          error instanceof PersistedQueryNotSupportedError,
      )
    : false;
}
