import { GraphQLSchema, isObjectType, isScalarType } from 'graphql';

// Returns true if it appears that the schema was returned from
// @apollo/federation's buildFederatedSchema. This strategy avoids depending
// explicitly on @apollo/federation or relying on something that might not
// survive transformations like monkey-patching a boolean field onto the
// schema.
//
// This is used for two things:
// 1) Determining whether traces should be added to responses if requested
//    with an HTTP header. If you want to include these traces even for
//    non-federated schemas (when requested via header) you can use
//    ApolloServerPluginInlineTrace yourself; if you want to never
//    include these traces even for federated schemas you can use
//    ApolloServerPluginInlineTraceDisabled.
// 2) Determining whether schema-reporting should be allowed; federated
//    services shouldn't be reporting schemas, and we accordingly throw if
//    it's attempted.
export function schemaIsFederated(schema: GraphQLSchema): boolean {
  const serviceType = schema.getType('_Service');
  if (!(serviceType && isObjectType(serviceType))) {
    return false;
  }
  const sdlField = serviceType.getFields().sdl;
  if (!sdlField) {
    return false;
  }
  const sdlFieldType = sdlField.type;
  if (!isScalarType(sdlFieldType)) {
    return false;
  }
  return sdlFieldType.name == 'String';
}
