import { Trace } from 'apollo-reporting-protobuf';
import { TraceTreeBuilder } from '../traceTreeBuilder';
import type { ApolloServerPluginUsageReportingOptions } from '../usageReporting/options';
import type { InternalApolloServerPlugin } from '../internalPlugin';
import { schemaIsFederated } from '../schemaIsFederated';

export interface ApolloServerPluginInlineTraceOptions {
  /**
   * By default, all errors from this service get included in the trace.  You
   * can specify a filter function to exclude specific errors from being
   * reported by returning an explicit `null`, or you can mask certain details
   * of the error by modifying it and returning the modified error.
   */
  rewriteError?: ApolloServerPluginUsageReportingOptions<never>['rewriteError'];
  /**
   * This option is for internal use by `apollo-server-core` only.
   *
   * By default we want to enable this plugin for federated schemas only, but we
   * need to come up with our list of plugins before we have necessarily loaded
   * the schema. So (unless the user installs this plugin or
   * ApolloServerPluginInlineTraceDisabled themselves), `apollo-server-core`
   * always installs this plugin and uses this option to make sure traces are
   * only included if the schema appears to be federated.
   */
  __onlyIfSchemaIsFederated?: boolean;
}

// This ftv1 plugin produces a base64'd Trace protobuf containing only the
// durationNs, startTime, endTime, and root fields.  This output is placed
// on the `extensions`.`ftv1` property of the response.  The Apollo Gateway
// utilizes this data to construct the full trace and submit it to Apollo's
// usage reporting ingress.
export function ApolloServerPluginInlineTrace(
  options: ApolloServerPluginInlineTraceOptions = Object.create(null),
): InternalApolloServerPlugin {
  let enabled: boolean | null = options.__onlyIfSchemaIsFederated ? null : true;
  return {
    __internal_plugin_id__() {
      return 'InlineTrace';
    },
    serverWillStart({ schema, logger }) {
      // Handle the case that the plugin was implicitly installed. We only want it
      // to actually be active if the schema appears to be federated. If you don't
      // like the log line, just install `ApolloServerPluginInlineTrace()` in
      // `plugins` yourself.
      if (enabled === null) {
        enabled = schemaIsFederated(schema);
        if (enabled) {
          logger.info(
            'Enabling inline tracing for this federated service. To disable, use ' +
              'ApolloServerPluginInlineTraceDisabled.',
          );
        }
      }
    },
    requestDidStart({ request: { http } }) {
      if (!enabled) {
        return;
      }

      const treeBuilder = new TraceTreeBuilder({
        rewriteError: options.rewriteError,
      });

      // XXX Provide a mechanism to customize this logic.
      if (http?.headers.get('apollo-federation-include-trace') !== 'ftv1') {
        return;
      }

      treeBuilder.startTiming();

      return {
        executionDidStart: () => ({
          willResolveField({ info }) {
            return treeBuilder.willResolveField(info);
          },
        }),

        didEncounterErrors({ errors }) {
          treeBuilder.didEncounterErrors(errors);
        },

        willSendResponse({ response }) {
          // We record the end time at the latest possible time: right before serializing the trace.
          // If we wait any longer, the time we record won't actually be sent anywhere!
          treeBuilder.stopTiming();

          const encodedUint8Array = Trace.encode(treeBuilder.trace).finish();
          const encodedBuffer = Buffer.from(
            encodedUint8Array,
            encodedUint8Array.byteOffset,
            encodedUint8Array.byteLength,
          );

          const extensions =
            response.extensions || (response.extensions = Object.create(null));

          // This should only happen if another plugin is using the same name-
          // space within the `extensions` object and got to it before us.
          if (typeof extensions.ftv1 !== 'undefined') {
            throw new Error('The `ftv1` extension was already present.');
          }

          extensions.ftv1 = encodedBuffer.toString('base64');
        },
      };
    },
  };
}

// This plugin does nothing, but it ensures that ApolloServer won't try
// to add a default ApolloServerPluginInlineTrace.
export function ApolloServerPluginInlineTraceDisabled(): InternalApolloServerPlugin {
  return {
    __internal_plugin_id__() {
      return 'InlineTrace';
    },
  };
}
