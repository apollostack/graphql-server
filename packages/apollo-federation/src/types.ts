import {
  GraphQLFieldConfig,
  GraphQLString,
  GraphQLUnionType,
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLNonNull,
  GraphQLList,
  GraphQLType,
  GraphQLNamedType,
  isNamedType,
  GraphQLResolveInfo,
  isObjectType,
} from 'graphql';
import { PromiseOrValue } from 'graphql/jsutils/PromiseOrValue';

export const EntityType = new GraphQLUnionType({
  name: '_Entity',
  types: [],
});

export const ServiceType = new GraphQLObjectType({
  name: '_Service',
  fields: {
    sdl: {
      type: GraphQLString,
      description:
        'The sdl representing the federated service capabilities. Includes federation directives, removes federation types, and includes rest of full schema after schema directives have been applied',
    },
  },
});

export const AnyType = new GraphQLScalarType({
  name: '_Any',
  serialize(value) {
    return value;
  },
});

function isPromise<T>(value: PromiseOrValue<T>): value is Promise<T> {
  return Boolean(value && 'then' in value && typeof value.then === 'function');
}

function addTypeNameToPossibleReturn<T>(
  maybeObject: null | T,
  typename: string,
): null | T & { __typename: string } {
  if (maybeObject !== null && typeof maybeObject === 'object') {
    Object.defineProperty(maybeObject, '__typename', {
      value: typename,
    });
  }
  return maybeObject as null | T & { __typename: string };
}

export type GraphQLReferencesResolver<TContext> = (
  references: object[],
  context: TContext,
  info: GraphQLResolveInfo,
) => any;

export type GraphQLReferenceResolver<TContext> = (
  reference: object,
  context: TContext,
  info: GraphQLResolveInfo,
) => any;

declare module 'graphql/type/definition' {
  interface GraphQLObjectType {
    resolveReference?: GraphQLReferenceResolver<any>;
    resolveReferences?: GraphQLReferencesResolver<any>;
  }

  interface GraphQLObjectTypeConfig<TSource, TContext> {
    resolveReference?: GraphQLReferenceResolver<TContext>;
    resolveReferences?: GraphQLReferencesResolver<TContext>;
  }
}

export const entitiesField: GraphQLFieldConfig<any, any> = {
  type: new GraphQLNonNull(new GraphQLList(EntityType)),
  args: {
    representations: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(AnyType))),
    },
  },
  description: '',
  async resolve(_source, { representations }, context, info) {
    const result = async () => {
      const buckets: { [typename: string]: object[] } = {};

      representations.forEach((reference: { __typename: string }) => {
        const { __typename } = reference;
        if (!buckets[__typename]) buckets[__typename] = [];
        buckets[__typename].push(reference);
      });

      return Promise.all(
        Object.entries(buckets).map(([__typename, references]) => {
          const type = info.schema.getType(__typename);
          if (!type || !isObjectType(type)) {
            throw new Error(
              `The _entities resolver tried to load an entity for type "${__typename}", but no object type of that name was found in the schema`,
            );
          }

          if (type.resolveReferences) {
            const results = type.resolveReferences(references, context, info);
            if (isPromise(results)) {
              return results.then((xs: any) =>
                xs.map((x: any) => addTypeNameToPossibleReturn(x, __typename)),
              );
            }
            return results.map((result: any) =>
              addTypeNameToPossibleReturn(result, __typename),
            );
          } else {
            return Promise.all(
              references.map(reference => {
                const resolveReference = type.resolveReference
                  ? type.resolveReference
                  : function defaultResolveReference() {
                      return reference;
                    };

                // FIXME somehow get this to show up special in Engine traces?
                const result = resolveReference(reference, context, info);

                if (isPromise(result)) {
                  return result.then((x: any) =>
                    addTypeNameToPossibleReturn(x, __typename),
                  );
                }

                return addTypeNameToPossibleReturn(result, __typename);
              }),
            );
          }
        }),
      );
    };
    return (await result()).flat();
  },
};

export const serviceField: GraphQLFieldConfig<any, any> = {
  type: new GraphQLNonNull(ServiceType),
};

export const federationTypes: GraphQLNamedType[] = [
  ServiceType,
  AnyType,
  EntityType,
];

export function isFederationType(type: GraphQLType): boolean {
  return (
    isNamedType(type) && federationTypes.some(({ name }) => name === type.name)
  );
}
