import { isNotNullOrUndefined } from 'apollo-env';
import {
  DocumentNode,
  FieldNode,
  FragmentDefinitionNode,
  getNamedType,
  getOperationRootType,
  GraphQLAbstractType,
  GraphQLCompositeType,
  GraphQLError,
  GraphQLField,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLType,
  InlineFragmentNode,
  isAbstractType,
  isCompositeType,
  isIntrospectionType,
  isListType,
  isNamedType,
  isObjectType,
  Kind,
  OperationDefinitionNode,
  SelectionSetNode,
  typeFromAST,
  TypeNameMetaFieldDef,
  visit,
  VariableDefinitionNode,
  OperationTypeNode,
  print,
  stripIgnoredCharacters,
} from 'graphql';
import {
  Field,
  FieldSet,
  groupByParentType,
  groupByResponseName,
  matchesField,
  selectionSetFromFieldSet,
  Scope,
} from './FieldSet';
import {
  FetchNode,
  ParallelNode,
  PlanNode,
  SequenceNode,
  QueryPlan,
  ResponsePath,
  OperationContext,
  trimSelectionNodes,
  FragmentMap,
} from './QueryPlan';
import { getFieldDef, getResponseName } from './utilities/graphql';
import { MultiMap } from './utilities/MultiMap';
import { getFederationMetadata } from '@apollo/federation/dist/composition/utils';
const _ = require('lodash')

const typenameField = {
  kind: Kind.FIELD,
  name: {
    kind: Kind.NAME,
    value: TypeNameMetaFieldDef.name,
  },
};

export interface BuildQueryPlanOptions {
  autoFragmentization: boolean;
}

export function buildQueryPlan(
  operationContext: OperationContext,
  options: BuildQueryPlanOptions = { autoFragmentization: false },
): QueryPlan {
  const context = buildQueryPlanningContext(operationContext, options);

  if (context.operation.operation === 'subscription') {
    throw new GraphQLError(
      'Query planning does not support subscriptions for now.',
      [context.operation],
    );
  }

  const rootType = getOperationRootType(context.schema, context.operation);

  const isMutation = context.operation.operation === 'mutation';

  const fields = collectFields(
    context,
    context.newScope(rootType),
    context.operation.selectionSet,
  );

  // Mutations are a bit more specific in how FetchGroups can be built, as some
  // calls to the same service may need to be executed serially.
  const groups = isMutation
    ? splitRootFieldsSerially(context, fields)
    : splitRootFields(context, fields);

  const nodes = groups.map(group =>
    executionNodeForGroup(context, group, rootType),
  );

  return {
    kind: 'QueryPlan',
    node: nodes.length
      // if an operation is a mutation, we run the root fields in sequence,
      // otherwise we run them in parallel
      ? flatWrap(isMutation ? 'Sequence' : 'Parallel', nodes)
      : undefined,
  };
}

function executionNodeForGroup(
  context: QueryPlanningContext,
  {
    serviceName,
    fields,
    requiredFields,
    internalFragments,
    mergeAt,
    dependentGroups,
  }: FetchGroup,
  parentType?: GraphQLCompositeType,
): PlanNode {
  const selectionSet = selectionSetFromFieldSet(fields, parentType);
  const requires =
    requiredFields.length > 0
      ? selectionSetFromFieldSet(requiredFields)
      : undefined;
  const variableUsages = context.getVariableUsages(
    selectionSet,
    internalFragments,
  );

  const operation = requires
    ? operationForEntitiesFetch({
        selectionSet,
        variableUsages,
        internalFragments,
      })
    : operationForRootFetch({
        selectionSet,
        variableUsages,
        internalFragments,
        operation: context.operation.operation,
      });

  // Putting Selection Set back. There is not enough context provided without it
  // to regenerate the Fetch.operation at runtime without it
  // https://github.com/jazzyray/apollo-server/pull/2/commits/f515e89055b2a462de2d96a9c1531f56f548aa83
  // JakeDawkins^
  const fetchNode: FetchNode = {
    kind: 'Fetch',
    serviceName,
    selectionSet,
    variableUsages,
    internalFragments,
    requires: requires ? trimSelectionNodes(requires?.selections) : undefined,
    operation: stripIgnoredCharacters(print(operation)),
  };

  const node: PlanNode =
    mergeAt && mergeAt.length > 0
      ? {
          kind: 'Flatten',
          path: mergeAt,
          node: fetchNode,
        }
      : fetchNode;

  if (dependentGroups.length > 0) {
    // Remove duplicate dependent groups, they get merged anyhow
    dependentGroups = _.uniqWith(dependentGroups, _.isEqual);

    const dependentNodes = dependentGroups.map(dependentGroup =>
        executionNodeForGroup(context, dependentGroup))


    return flatWrap('Sequence', [node, flatWrap('Parallel', dependentNodes)]);
  } else {
    return node;
  }
}

interface VariableUsages {
  [name: string]: VariableDefinitionNode
}

function mapFetchNodeToVariableDefinitions(
  variableUsages: VariableUsages,
): VariableDefinitionNode[] {
  return variableUsages ? Object.values(variableUsages) : [];
}

function operationForRootFetch({
  selectionSet,
  variableUsages,
  internalFragments,
  operation = 'query',
}: {
  selectionSet: SelectionSetNode;
  variableUsages: VariableUsages;
  internalFragments: Set<FragmentDefinitionNode>;
  operation?: OperationTypeNode;
}): DocumentNode {
  return {
    kind: Kind.DOCUMENT,
    definitions: [
      {
        kind: Kind.OPERATION_DEFINITION,
        operation,
        selectionSet,
        variableDefinitions: mapFetchNodeToVariableDefinitions(variableUsages),
      },
      ...internalFragments,
    ],
  };
}

export function operationForEntitiesFetch({
  selectionSet,
  variableUsages,
  internalFragments,
}: {
  selectionSet: SelectionSetNode;
  variableUsages: VariableUsages;
  internalFragments: Set<FragmentDefinitionNode>;
}): DocumentNode {
  const representationsVariable = {
    kind: Kind.VARIABLE,
    name: { kind: Kind.NAME, value: 'representations' },
  };

  return {
    kind: Kind.DOCUMENT,
    definitions: [
      {
        kind: Kind.OPERATION_DEFINITION,
        operation: 'query',
        variableDefinitions: ([
          {
            kind: Kind.VARIABLE_DEFINITION,
            variable: representationsVariable,
            type: {
              kind: Kind.NON_NULL_TYPE,
              type: {
                kind: Kind.LIST_TYPE,
                type: {
                  kind: Kind.NON_NULL_TYPE,
                  type: {
                    kind: Kind.NAMED_TYPE,
                    name: { kind: Kind.NAME, value: '_Any' },
                  },
                },
              },
            },
          },
        ] as VariableDefinitionNode[]).concat(
          mapFetchNodeToVariableDefinitions(variableUsages),
        ),
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: [
            {
              kind: Kind.FIELD,
              name: { kind: Kind.NAME, value: '_entities' },
              arguments: [
                {
                  kind: Kind.ARGUMENT,
                  name: {
                    kind: Kind.NAME,
                    value: representationsVariable.name.value,
                  },
                  value: representationsVariable,
                },
              ],
              selectionSet,
            },
          ],
        },
      },
      ...internalFragments,
    ],
  };
}

// Wraps the given nodes in a ParallelNode or SequenceNode, unless there's only
// one node, in which case it is returned directly. Any nodes of the same kind
// in the given list have their sub-nodes flattened into the list: ie,
// flatWrap('Sequence', [a, flatWrap('Sequence', b, c), d]) returns a SequenceNode
// with four children.
function flatWrap(
  kind: ParallelNode['kind'] | SequenceNode['kind'],
  nodes: PlanNode[],
): PlanNode {
  if (nodes.length === 0) {
    throw Error('programming error: should always be called with nodes');
  }
  if (nodes.length === 1) {
    return nodes[0];
  }
  return {
    kind,
    nodes: nodes.flatMap(n => (n.kind === kind ? n.nodes : [n])),
  } as PlanNode;
}

function splitRootFields(
  context: QueryPlanningContext,
  fields: FieldSet,
): FetchGroup[] {
  const groupsByService: {
    [serviceName: string]: FetchGroup;
  } = Object.create(null);

  function groupForService(serviceName: string) {
    let group = groupsByService[serviceName];

    if (!group) {
      group = new FetchGroup(serviceName);
      groupsByService[serviceName] = group;
    }

    return group;
  }

  splitFields(context, [], fields, field => {
    const { scope, fieldNode, fieldDef } = field;
    const { parentType } = scope;

    const owningService = context.getOwningService(parentType, fieldDef);

    if (!owningService) {
      throw new GraphQLError(
        `Couldn't find owning service for field "${parentType.name}.${fieldDef.name}"`,
        fieldNode,
      );
    }

    return groupForService(owningService);
  });

  return Object.values(groupsByService);
}

// For mutations, we need to respect the order of the fields, in order to
// determine which fields can be batched together in the same request. If
// they're "split" by fields belonging to other services, then we need to manage
// the proper sequencing at the gateway level. In this example, we need 3
// FetchGroups (requests) in sequence:
//
//    mutation abc {
//      createReview() # reviews service (1)
//      updateReview() # reviews service (1)
//      login() # account service (2)
//      deleteReview() # reviews service (3)
//    }
function splitRootFieldsSerially(
  context: QueryPlanningContext,
  fields: FieldSet,
): FetchGroup[] {
  const fetchGroups: FetchGroup[] = [];

  function groupForField(serviceName: string) {
    let group: FetchGroup;

    // If the most recent FetchGroup in the array belongs to the same service,
    // the field in question can be batched within that group.
    const previousGroup = fetchGroups[fetchGroups.length - 1];
    if (previousGroup && previousGroup.serviceName === serviceName) {
      return previousGroup;
    }

    // If there's no previous group, or the previous group is from a different
    // service, then we need to add a new FetchGroup.
    group = new FetchGroup(serviceName);
    fetchGroups.push(group);

    return group;
  }

  splitFields(context, [], fields, field => {
    const { scope, fieldNode, fieldDef } = field;
    const { parentType } = scope;

    const owningService = context.getOwningService(parentType, fieldDef);

    if (!owningService) {
      throw new GraphQLError(
        `Couldn't find owning service for field "${parentType.name}.${fieldDef.name}"`,
        fieldNode,
      );
    }

    return groupForField(owningService);
  });

  return fetchGroups;
}

function splitSubfields(
  context: QueryPlanningContext,
  path: ResponsePath,
  fields: FieldSet,
  parentGroup: FetchGroup,
) {
  splitFields(context, path, fields, field => {
    const { scope, fieldNode, fieldDef } = field;
    const { parentType } = scope;

    let baseService, owningService;

    const parentTypeFederationMetadata = getFederationMetadata(parentType);
    if (parentTypeFederationMetadata?.isValueType) {
      baseService = parentGroup.serviceName;
      owningService = parentGroup.serviceName;
    } else {
      baseService = context.getBaseService(parentType);
      owningService = context.getOwningService(parentType, fieldDef);
    }

    if (!baseService) {
      throw new GraphQLError(
        `Couldn't find base service for type "${parentType.name}"`,
        fieldNode,
      );
    }

    if (!owningService) {
      throw new GraphQLError(
        `Couldn't find owning service for field "${parentType.name}.${fieldDef.name}"`,
        fieldNode,
      );
    }
    // Is the field defined on the base service?
    if (owningService === baseService) {
      // Can we fetch the field from the parent group?
      if (
        owningService === parentGroup.serviceName ||
        parentGroup.providedFields.some(matchesField(field))
      ) {
        return parentGroup;
      } else {
        // We need to fetch the key fields from the parent group first, and then
        // use a dependent fetch from the owning service.
        let keyFields = context.getKeyFields({
          parentType,
          serviceName: parentGroup.serviceName,
        });
        if (
          keyFields.length === 0 ||
          (keyFields.length === 1 &&
            keyFields[0].fieldDef.name === '__typename')
        ) {
          // Only __typename key found.
          // In some cases, the parent group does not have any @key directives.
          // Fall back to owning group's keys
          keyFields = context.getKeyFields({
            parentType,
            serviceName: owningService,
          });
        }
        return parentGroup.dependentGroupForService(owningService, keyFields);
      }
    } else {
      // It's an extension field, so we need to fetch the required fields first.
      const requiredFields = context.getRequiredFields(
        parentType,
        fieldDef,
        owningService,
      );

      // Can we fetch the required fields from the parent group?
      if (
        requiredFields.every(requiredField =>
          parentGroup.providedFields.some(matchesField(requiredField)),
        )
      ) {
        if (owningService === parentGroup.serviceName) {
          return parentGroup;
        } else {
          return parentGroup.dependentGroupForService(
            owningService,
            requiredFields,
          );
        }
      } else {
        // We need to go through the base group first.

        const keyFields = context.getKeyFields({
          parentType,
          serviceName: parentGroup.serviceName,
        });

        if (!keyFields) {
          throw new GraphQLError(
            `Couldn't find keys for type "${parentType.name}}" in service "${baseService}"`,
            fieldNode,
          );
        }

        if (baseService === parentGroup.serviceName) {
          return parentGroup.dependentGroupForService(
            owningService,
            requiredFields,
          );
        }

        const baseGroup = parentGroup.dependentGroupForService(
          baseService,
          keyFields,
        );

        return baseGroup.dependentGroupForService(
          owningService,
          requiredFields,
        );
      }
    }
  });
}

function splitFields(
  context: QueryPlanningContext,
  path: ResponsePath,
  fields: FieldSet,
  groupForField: (field: Field<GraphQLObjectType>) => FetchGroup,
) {
  for (const fieldsForResponseName of groupByResponseName(fields).values()) {
    for (const [parentType, fieldsForParentType] of groupByParentType(fieldsForResponseName)) {
      // Field nodes that share the same response name and parent type are guaranteed
      // to have the same field name and arguments. We only need the other nodes when
      // merging selection sets, to take node-specific subfields and directives
      // into account.

      const field = fieldsForParentType[0];
      const { scope, fieldDef } = field;

      // We skip `__typename` for root types.
      if (fieldDef.name === TypeNameMetaFieldDef.name) {
        const { schema } = context;
        const roots = [
          schema.getQueryType(),
          schema.getMutationType(),
          schema.getSubscriptionType(),
        ]
          .filter(isNotNullOrUndefined)
          .map(type => type.name);
        if (roots.indexOf(parentType.name) > -1) continue;
      }

      // We skip introspection fields like `__schema` and `__type`.
      if (isIntrospectionType(getNamedType(fieldDef.type))) {
        continue;
      }

      if (isObjectType(parentType) && scope.possibleTypes.includes(parentType)) {
        // If parent type is an object type, we can directly look for the right
        // group.
        const group = groupForField(field as Field<GraphQLObjectType>);
        group.fields.push(
          completeField(
            context,
            scope as Scope<typeof parentType>,
            group,
            path,
            fieldsForParentType,
          ),
        );
      } else {
        // For interfaces however, we need to look at all possible runtime types.

        /**
         * The following is an optimization to prevent an explosion of type
         * conditions to services when it isn't needed. If all possible runtime
         * types can be fufilled by only one service then we don't need to
         * expand the fields into unique type conditions.
         */

        // Collect all of the field defs on the possible runtime types
        const possibleFieldDefs = scope.possibleTypes.map(
          runtimeType => context.getFieldDef(runtimeType, field.fieldNode),
        );

        // If none of the field defs have a federation property, this interface's
        // implementors can all be resolved within the same service.
        const hasNoExtendingFieldDefs = !possibleFieldDefs.some(
          getFederationMetadata,
        );

        // With no extending field definitions, we can engage the optimization
        if (hasNoExtendingFieldDefs) {
          const group = groupForField(field as Field<GraphQLObjectType>);
          group.fields.push(
            completeField(context, scope, group, path, fieldsForResponseName)
          );
          continue;
        }

        // We keep track of which possible runtime parent types can be fetched
        // from which group,
        const groupsByRuntimeParentTypes = new MultiMap<
          FetchGroup,
          GraphQLObjectType
        >();

        for (const runtimeParentType of scope.possibleTypes) {
          const fieldDef = context.getFieldDef(
            runtimeParentType,
            field.fieldNode,
          );
          groupsByRuntimeParentTypes.add(
            groupForField({
              scope: context.newScope(runtimeParentType, scope),
              fieldNode: field.fieldNode,
              fieldDef,
            }),
            runtimeParentType,
          );
        }

        // We add the field separately for each runtime parent type.
        for (const [group, runtimeParentTypes] of groupsByRuntimeParentTypes) {
          for (const runtimeParentType of runtimeParentTypes) {
            // We need to adjust the fields to contain the right fieldDef for
            // their runtime parent type.

            const fieldDef = context.getFieldDef(
              runtimeParentType,
              field.fieldNode,
            );

            const fieldsWithRuntimeParentType = fieldsForParentType.map(field => ({
              ...field,
              fieldDef,
            }));

            group.fields.push(
              completeField(
                context,
                context.newScope(runtimeParentType, scope),
                group,
                path,
                fieldsWithRuntimeParentType,
              ),
            );
          }
        }
      }
    }
  }
}

function completeField(
  context: QueryPlanningContext,
  scope: Scope<GraphQLCompositeType>,
  parentGroup: FetchGroup,
  path: ResponsePath,
  fields: FieldSet,
): Field {
  const { fieldNode, fieldDef } = fields[0];
  const returnType = getNamedType(fieldDef.type);

  if (!isCompositeType(returnType)) {
    // FIXME: We should look at all field nodes to make sure we take directives
    // into account (or remove directives for the time being).
    return { scope, fieldNode, fieldDef };
  } else {
    // For composite types, we need to recurse.

    const fieldPath = addPath(path, getResponseName(fieldNode), fieldDef.type);

    const subGroup = new FetchGroup(parentGroup.serviceName);
    subGroup.mergeAt = fieldPath;

    subGroup.providedFields = context.getProvidedFields(
      fieldDef,
      parentGroup.serviceName,
    );

    // For abstract types, we always need to request `__typename`
    if (isAbstractType(returnType)) {
      subGroup.fields.push({
        scope: context.newScope(returnType, scope),
        fieldNode: typenameField,
        fieldDef: TypeNameMetaFieldDef,
      });
    }

    const subfields = collectSubfields(context, returnType, fields);
    splitSubfields(context, fieldPath, subfields, subGroup);

    parentGroup.otherDependentGroups.push(...subGroup.dependentGroups);

    let definition: FragmentDefinitionNode;
    let selectionSet = selectionSetFromFieldSet(subGroup.fields, returnType);

    if (context.autoFragmentization && subGroup.fields.length > 2) {
      ({ definition, selectionSet } = getInternalFragment(
        selectionSet,
        returnType,
        context,
      ));
      parentGroup.internalFragments.add(definition);
    }

    // "Hoist" internalFragments of the subGroup into the parentGroup so all
    // fragments can be included in the final request for the root FetchGroup
    subGroup.internalFragments.forEach(fragment => {
      parentGroup.internalFragments.add(fragment);
    });

    return {
      scope,
      fieldNode: {
        ...fieldNode,
        selectionSet,
      },
      fieldDef,
    };
  }
}

function getInternalFragment(
  selectionSet: SelectionSetNode,
  returnType: GraphQLCompositeType,
  context: QueryPlanningContext
) {
  const key = JSON.stringify(selectionSet);
  if (!context.internalFragments.has(key)) {
    const name = `__QueryPlanFragment_${context.internalFragmentCount++}__`;

    const definition: FragmentDefinitionNode = {
      kind: Kind.FRAGMENT_DEFINITION,
      name: {
        kind: Kind.NAME,
        value: name,
      },
      typeCondition: {
        kind: Kind.NAMED_TYPE,
        name: {
          kind: Kind.NAME,
          value: returnType.name,
        },
      },
      selectionSet,
    };

    const fragmentSelection: SelectionSetNode = {
      kind: Kind.SELECTION_SET,
      selections: [
        {
          kind: Kind.FRAGMENT_SPREAD,
          name: {
            kind: Kind.NAME,
            value: name,
          },
        },
      ],
    };

    context.internalFragments.set(key, {
      name,
      definition,
      selectionSet: fragmentSelection,
    });
  }

  return context.internalFragments.get(key)!;
}

function collectFields(
  context: QueryPlanningContext,
  scope: Scope<GraphQLCompositeType>,
  selectionSet: SelectionSetNode,
  fields: FieldSet = [],
  visitedFragmentNames: { [fragmentName: string]: boolean } = Object.create(
    null,
  ),
): FieldSet {
  for (const selection of selectionSet.selections) {
    switch (selection.kind) {
      case Kind.FIELD:
        const fieldDef = context.getFieldDef(scope.parentType, selection);
        fields.push({ scope, fieldNode: selection, fieldDef });
        break;
      case Kind.INLINE_FRAGMENT: {
        const newScope = context.newScope(getFragmentCondition(selection), scope);
        if (newScope.possibleTypes.length === 0) {
          break;
        }

        collectFields(
          context,
          context.newScope(getFragmentCondition(selection), scope),
          selection.selectionSet,
          fields,
          visitedFragmentNames,
        );
        break;
      }
      case Kind.FRAGMENT_SPREAD:
        const fragmentName = selection.name.value;

        const fragment = context.fragments[fragmentName];
        if (!fragment) {
          continue;
        }

        const newScope = context.newScope(getFragmentCondition(fragment), scope);
        if (newScope.possibleTypes.length === 0) {
          continue;
        }

        if (visitedFragmentNames[fragmentName]) {
          continue;
        }
        visitedFragmentNames[fragmentName] = true;

        collectFields(
          context,
          newScope,
          fragment.selectionSet,
          fields,
          visitedFragmentNames,
        );
        break;
    }
  }

  return fields;

  function getFragmentCondition(
    fragment: FragmentDefinitionNode | InlineFragmentNode,
  ): GraphQLCompositeType {
    const typeConditionNode = fragment.typeCondition;
    if (!typeConditionNode) return scope.parentType;

    return typeFromAST(
      context.schema,
      typeConditionNode,
    ) as GraphQLCompositeType;
  }
}

// Collecting subfields collapses parent types, because it merges
// selection sets without taking the runtime parent type of the field
// into account. If we want to keep track of multiple levels of possible
// types, this is where that would need to happen.
export function collectSubfields(
  context: QueryPlanningContext,
  returnType: GraphQLCompositeType,
  fields: FieldSet,
): FieldSet {
  let subfields: FieldSet = [];
  const visitedFragmentNames = Object.create(null);

  for (const field of fields) {
    const selectionSet = field.fieldNode.selectionSet;

    if (selectionSet) {
      subfields = collectFields(
        context,
        context.newScope(returnType),
        selectionSet,
        subfields,
        visitedFragmentNames,
      );
    }
  }

  return subfields;
}

class FetchGroup {
  constructor(
    public readonly serviceName: string,
    public readonly fields: FieldSet = [],
    public readonly internalFragments: Set<FragmentDefinitionNode> = new Set()
  ) {}

  requiredFields: FieldSet = [];
  providedFields: FieldSet = [];

  mergeAt?: ResponsePath;

  private dependentGroupsByService: {
    [serviceName: string]: FetchGroup;
  } = Object.create(null);
  public otherDependentGroups: FetchGroup[] = [];

  dependentGroupForService(serviceName: string, requiredFields: FieldSet) {
    let group = this.dependentGroupsByService[serviceName];

    if (!group) {
      group = new FetchGroup(serviceName);
      group.mergeAt = this.mergeAt;
      this.dependentGroupsByService[serviceName] = group;
    }

    if (requiredFields) {
      if (group.requiredFields) {
        group.requiredFields.push(...requiredFields);
      } else {
        group.requiredFields = requiredFields;
      }
      this.fields.push(...requiredFields);
    }

    return group;
  }

  get dependentGroups() {
    return [
      ...Object.values(this.dependentGroupsByService),
      ...this.otherDependentGroups,
    ];
  }
}

// Adapted from buildExecutionContext in graphql-js
export function buildOperationContext(
  schema: GraphQLSchema,
  document: DocumentNode,
  operationName?: string,
): OperationContext {
  let operation: OperationDefinitionNode | undefined;
  const fragments: {
    [fragmentName: string]: FragmentDefinitionNode;
  } = Object.create(null);
  document.definitions.forEach(definition => {
    switch (definition.kind) {
      case Kind.OPERATION_DEFINITION:
        if (!operationName && operation) {
          throw new GraphQLError(
            'Must provide operation name if query contains ' +
              'multiple operations.',
          );
        }
        if (
          !operationName ||
          (definition.name && definition.name.value === operationName)
        ) {
          operation = definition;
        }
        break;
      case Kind.FRAGMENT_DEFINITION:
        fragments[definition.name.value] = definition;
        break;
    }
  });
  if (!operation) {
    if (operationName) {
      throw new GraphQLError(`Unknown operation named "${operationName}".`);
    } else {
      throw new GraphQLError('Must provide an operation.');
    }
  }

  return { schema, operation, fragments };
}

export function buildQueryPlanningContext(
  { operation, schema, fragments }: OperationContext,
  options: BuildQueryPlanOptions,
): QueryPlanningContext {
  return new QueryPlanningContext(
    schema,
    operation,
    fragments,
    options.autoFragmentization,
  );
}

export class QueryPlanningContext {
  public internalFragments: Map<
    string,
    {
      name: string;
      definition: FragmentDefinitionNode;
      selectionSet: SelectionSetNode;
    }
  > = new Map();

  public internalFragmentCount = 0;

  protected variableDefinitions: {
    [name: string]: VariableDefinitionNode;
  };

  constructor(
    public readonly schema: GraphQLSchema,
    public readonly operation: OperationDefinitionNode,
    public readonly fragments: FragmentMap,
    public readonly autoFragmentization: boolean,
  ) {
    this.variableDefinitions = Object.create(null);
    visit(operation, {
      VariableDefinition: definition => {
        this.variableDefinitions[definition.variable.name.value] = definition;
      },
    });
  }

  getFieldDef(parentType: GraphQLCompositeType, fieldNode: FieldNode) {
    const fieldName = fieldNode.name.value;

    const fieldDef = getFieldDef(this.schema, parentType, fieldName);

    if (!fieldDef) {
      throw new GraphQLError(
        `Cannot query field "${fieldNode.name.value}" on type "${String(
          parentType,
        )}"`,
        fieldNode,
      );
    }

    return fieldDef;
  }

  getPossibleTypes(
    type: GraphQLAbstractType | GraphQLObjectType,
  ): ReadonlyArray<GraphQLObjectType> {
    return isAbstractType(type) ? this.schema.getPossibleTypes(type) : [type];
  }

  getVariableUsages(
    selectionSet: SelectionSetNode,
    fragments: Set<FragmentDefinitionNode>,
  ) {
    const usages: {
      [name: string]: VariableDefinitionNode;
    } = Object.create(null);

    // Construct a document of the selection set and fragment definitions so we
    // can visit them, adding all variable usages to the `usages` object.
    const document: DocumentNode = {
      kind: Kind.DOCUMENT,
      definitions: [
        { kind: Kind.OPERATION_DEFINITION, selectionSet, operation: 'query' },
        ...Array.from(fragments),
      ],
    };

    visit(document, {
      Variable: (node) => {
        usages[node.name.value] = this.variableDefinitions[node.name.value];
      },
    });

    return usages;
  }

  newScope<TParent extends GraphQLCompositeType>(
    parentType: TParent,
    enclosingScope?: Scope<GraphQLCompositeType>,
  ): Scope<TParent> {
    return {
      parentType,
      possibleTypes: enclosingScope
        ? this.getPossibleTypes(parentType).filter(type =>
            enclosingScope.possibleTypes.includes(type),
          )
        : this.getPossibleTypes(parentType),
      enclosingScope,
    };
  }

  getBaseService(parentType: GraphQLObjectType): string | null {
    return (getFederationMetadata(parentType)?.serviceName) || null;
  }

  getOwningService(
    parentType: GraphQLObjectType,
    fieldDef: GraphQLField<any, any>,
  ): string | null {
    const fieldFederationMetadata = getFederationMetadata(fieldDef);
    if (
      fieldFederationMetadata?.serviceName &&
      !fieldFederationMetadata?.belongsToValueType
    ) {
      return fieldFederationMetadata.serviceName;
    } else {
      return this.getBaseService(parentType);
    }
  }

  getKeyFields({
    parentType,
    serviceName,
    fetchAll = false,
  }: {
    parentType: GraphQLCompositeType;
    serviceName: string;
    fetchAll?: boolean;
  }): FieldSet {
    const keyFields: FieldSet = [];

    keyFields.push({
      scope: {
        parentType,
        possibleTypes: this.getPossibleTypes(parentType),
      },
      fieldNode: typenameField,
      fieldDef: TypeNameMetaFieldDef,
    });

    for (const possibleType of this.getPossibleTypes(parentType)) {
      const keys = getFederationMetadata(possibleType)?.keys?.[serviceName];

      if (!(keys && keys.length > 0)) continue;

      if (fetchAll) {
        keyFields.push(
          ...keys.flatMap(key =>
            collectFields(this, this.newScope(possibleType), {
              kind: Kind.SELECTION_SET,
              selections: key,
            }),
          ),
        );
      } else {
        keyFields.push(
          ...collectFields(this, this.newScope(possibleType), {
            kind: Kind.SELECTION_SET,
            selections: keys[0],
          }),
        );
      }
    }

    return keyFields;
  }

  getRequiredFields(
    parentType: GraphQLCompositeType,
    fieldDef: GraphQLField<any, any>,
    serviceName: string,
  ): FieldSet {
    const requiredFields: FieldSet = [];

    requiredFields.push(...this.getKeyFields({ parentType, serviceName }));

    const fieldFederationMetadata = getFederationMetadata(fieldDef);
    if (fieldFederationMetadata?.requires) {
      requiredFields.push(
        ...collectFields(this, this.newScope(parentType), {
          kind: Kind.SELECTION_SET,
          selections: fieldFederationMetadata.requires,
        }),
      );
    }

    return requiredFields;
  }

  getProvidedFields(
    fieldDef: GraphQLField<any, any>,
    serviceName: string,
  ): FieldSet {
    const returnType = getNamedType(fieldDef.type);
    if (!isCompositeType(returnType)) return [];

    const providedFields: FieldSet = [];

    providedFields.push(
      ...this.getKeyFields({
        parentType: returnType,
        serviceName,
        fetchAll: true,
      }),
    );

    const fieldFederationMetadata = getFederationMetadata(fieldDef);
    if (fieldFederationMetadata?.provides) {
      providedFields.push(
        ...collectFields(this, this.newScope(returnType), {
          kind: Kind.SELECTION_SET,
          selections: fieldFederationMetadata.provides,
        }),
      );
    }

    return providedFields;
  }
}

function addPath(path: ResponsePath, responseName: string, type: GraphQLType) {
  path = [...path, responseName];

  while (!isNamedType(type)) {
    if (isListType(type)) {
      path.push('@');
    }

    type = type.ofType;
  }

  return path;
}
