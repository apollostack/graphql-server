// This class is a helper for ApolloServerPluginUsageReporting and
// ApolloServerPluginInlineTrace.
import { GraphQLError, GraphQLResolveInfo, ResponsePath } from 'graphql';
import { Trace, google } from 'apollo-reporting-protobuf';
import { Logger } from 'apollo-server-types';

function internalError(message: string) {
  return new Error(`[internal apollo-server error] ${message}`);
}

export class TraceTreeBuilder {
  private rootNode = new Trace.Node();
  private logger: Logger = console;
  public trace = new Trace({ root: this.rootNode });
  public startHrTime?: [number, number];
  private stopped = false;
  private nodes = new Map<string, Trace.Node>([
    [responsePathAsString(), this.rootNode],
  ]);
  private readonly rewriteError?: (err: GraphQLError) => GraphQLError | null;

  public constructor(options: {
    logger?: Logger;
    rewriteError?: (err: GraphQLError) => GraphQLError | null;
  }) {
    this.rewriteError = options.rewriteError;
    if (options.logger) this.logger = options.logger;
  }

  public startTiming() {
    if (this.startHrTime) {
      throw internalError('startTiming called twice!');
    }
    if (this.stopped) {
      throw internalError('startTiming called after stopTiming!');
    }
    this.trace.startTime = dateToProtoTimestamp(new Date());
    this.startHrTime = process.hrtime();
  }

  public stopTiming() {
    if (!this.startHrTime) {
      throw internalError('stopTiming called before startTiming!');
    }
    if (this.stopped) {
      throw internalError('stopTiming called twice!');
    }

    this.trace.durationNs = durationHrTimeToNanos(
      process.hrtime(this.startHrTime),
    );
    this.trace.endTime = dateToProtoTimestamp(new Date());
    this.stopped = true;
  }

  public willResolveField(info: GraphQLResolveInfo): () => void {
    if (!this.startHrTime) {
      throw internalError('willResolveField called before startTiming!');
    }
    if (this.stopped) {
      throw internalError('willResolveField called after stopTiming!');
    }

    const path = info.path;
    const node = this.newNode(path);
    node.type = info.returnType.toString();
    node.parentType = info.parentType.toString();
    node.startTime = durationHrTimeToNanos(process.hrtime(this.startHrTime));
    if (typeof path.key === 'string' && path.key !== info.fieldName) {
      // This field was aliased; send the original field name too (for FieldStats).
      node.originalFieldName = info.fieldName;
    }

    return () => {
      node.endTime = durationHrTimeToNanos(process.hrtime(this.startHrTime));
    };
  }

  public didEncounterErrors(errors: GraphQLError[]) {
    errors.forEach((err) => {
      // This is an error from a federated service. We will already be reporting
      // it in the nested Trace in the query plan.
      //
      // XXX This probably shouldn't skip query or validation errors, which are
      //      not in nested Traces because format() isn't called in this case! Or
      //      maybe format() should be called in that case?
      if (err.extensions && err.extensions.serviceName) {
        return;
      }

      // In terms of reporting, errors can be re-written by the user by
      // utilizing the `rewriteError` parameter.  This allows changing
      // the message or stack to remove potentially sensitive information.
      // Returning `null` will result in the error not being reported at all.
      const errorForReporting = this.rewriteAndNormalizeError(err);

      if (errorForReporting === null) {
        return;
      }

      this.addProtobufError(
        errorForReporting.path,
        errorToProtobufError(errorForReporting),
      );
    });
  }

  private addProtobufError(
    path: ReadonlyArray<string | number> | undefined,
    error: Trace.Error,
  ) {
    if (!this.startHrTime) {
      throw internalError('addProtobufError called before startTiming!');
    }
    if (this.stopped) {
      throw internalError('addProtobufError called after stopTiming!');
    }

    // By default, put errors on the root node.
    let node = this.rootNode;
    // If a non-GraphQLError Error sneaks in here somehow with a non-array
    // path, don't crash.
    if (Array.isArray(path)) {
      const specificNode = this.nodes.get(path.join('.'));
      if (specificNode) {
        node = specificNode;
      } else {
        this.logger.warn(
          `Could not find node with path ${path.join(
            '.',
          )}; defaulting to put errors on root node.`,
        );
      }
    }

    node.error.push(error);
  }

  private newNode(path: ResponsePath): Trace.Node {
    const node = new Trace.Node();
    const id = path.key;
    if (typeof id === 'number') {
      node.index = id;
    } else {
      node.responseName = id;
    }
    this.nodes.set(responsePathAsString(path), node);
    const parentNode = this.ensureParentNode(path);
    parentNode.child.push(node);
    return node;
  }

  private ensureParentNode(path: ResponsePath): Trace.Node {
    const parentPath = responsePathAsString(path.prev);
    const parentNode = this.nodes.get(parentPath);
    if (parentNode) {
      return parentNode;
    }
    // Because we set up the root path when creating this.nodes, we now know
    // that path.prev isn't undefined.
    return this.newNode(path.prev!);
  }

  private rewriteAndNormalizeError(err: GraphQLError): GraphQLError | null {
    if (this.rewriteError) {
      // Before passing the error to the user-provided `rewriteError` function,
      // we'll make a shadow copy of the error so the user is free to change
      // the object as they see fit.

      // At this stage, this error is only for the purposes of reporting, but
      // this is even more important since this is still a reference to the
      // original error object and changing it would also change the error which
      // is returned in the response to the client.

      // For the clone, we'll create a new object which utilizes the exact same
      // prototype of the error being reported.
      const clonedError = Object.assign(
        Object.create(Object.getPrototypeOf(err)),
        err,
      );

      const rewrittenError = this.rewriteError(clonedError);

      // Returning an explicit `null` means the user is requesting that the error
      // not be reported to Apollo.
      if (rewrittenError === null) {
        return null;
      }

      // We don't want users to be inadvertently not reporting errors, so if
      // they haven't returned an explicit `GraphQLError` (or `null`, handled
      // above), then we'll report the error as usual.
      if (!(rewrittenError instanceof GraphQLError)) {
        return err;
      }

      // We only allow rewriteError to change the message and extensions of the
      // error; we keep everything else the same. That way people don't have to
      // do extra work to keep the error on the same trace node. We also keep
      // extensions the same if it isn't explicitly changed (to, eg, {}). (Note
      // that many of the fields of GraphQLError are not enumerable and won't
      // show up in the trace (even in the json field) anyway.)
      return new GraphQLError(
        rewrittenError.message,
        err.nodes,
        err.source,
        err.positions,
        err.path,
        err.originalError,
        rewrittenError.extensions || err.extensions,
      );
    }
    return err;
  }
}

// Converts an hrtime array (as returned from process.hrtime) to nanoseconds.
//
// ONLY CALL THIS ON VALUES REPRESENTING DELTAS, NOT ON THE RAW RETURN VALUE
// FROM process.hrtime() WITH NO ARGUMENTS.
//
// The entire point of the hrtime data structure is that the JavaScript Number
// type can't represent all int64 values without loss of precision:
// Number.MAX_SAFE_INTEGER nanoseconds is about 104 days. Calling this function
// on a duration that represents a value less than 104 days is fine. Calling
// this function on an absolute time (which is generally roughly time since
// system boot) is not a good idea.
//
// XXX We should probably use google.protobuf.Duration on the wire instead of
// ever trying to store durations in a single number.
function durationHrTimeToNanos(hrtime: [number, number]) {
  return hrtime[0] * 1e9 + hrtime[1];
}

// Convert from the linked-list ResponsePath format to a dot-joined
// string. Includes the full path (field names and array indices).
function responsePathAsString(p?: ResponsePath): string {
  if (p === undefined) {
    return '';
  }

  // A previous implementation used `responsePathAsArray` from `graphql-js/execution`,
  // however, that employed an approach that created new arrays unnecessarily.
  let res = String(p.key);

  while ((p = p.prev) !== undefined) {
    res = `${p.key}.${res}`;
  }

  return res;
}

function errorToProtobufError(error: GraphQLError): Trace.Error {
  return new Trace.Error({
    message: error.message,
    location: (error.locations || []).map(
      ({ line, column }) => new Trace.Location({ line, column }),
    ),
    json: JSON.stringify(error),
  });
}

// Converts a JS Date into a Timestamp.
export function dateToProtoTimestamp(date: Date): google.protobuf.Timestamp {
  const totalMillis = +date;
  const millis = totalMillis % 1000;
  return new google.protobuf.Timestamp({
    seconds: (totalMillis - millis) / 1000,
    nanos: millis * 1e6,
  });
}
