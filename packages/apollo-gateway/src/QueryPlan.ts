import {
  FragmentDefinitionNode,
  GraphQLSchema,
  OperationDefinitionNode,
  VariableDefinitionNode,
  Kind,
  SelectionNode as GraphQLJSSelectionNode, SelectionSetNode,
} from 'graphql';
import prettyFormat from 'pretty-format';
import { queryPlanSerializer, astSerializer } from './snapshotSerializers';

export type ResponsePath = (string | number)[];

export type FragmentMap = { [fragmentName: string]: FragmentDefinitionNode };

export type OperationContext = {
  schema: GraphQLSchema;
  operation: OperationDefinitionNode;
  fragments: FragmentMap;
};

export interface QueryPlan {
  kind: 'QueryPlan';
  node?: PlanNode;
}

export type PlanNode = SequenceNode | ParallelNode | FetchNode | FlattenNode;

export interface SequenceNode {
  kind: 'Sequence';
  nodes: PlanNode[];
}

export interface ParallelNode {
  kind: 'Parallel';
  nodes: PlanNode[];
}

export interface FetchNode {
  kind: 'Fetch';
  serviceName: string;
  variableUsages?: { [name: string]: VariableDefinitionNode };
  requires?: QueryPlanSelectionNode[];
  operation: string;
  selectionSet: SelectionSetNode;
  internalFragments: Set<FragmentDefinitionNode>;
}

export interface FlattenNode {
  kind: 'Flatten';
  path: ResponsePath;
  node: PlanNode;
}

/**
 * SelectionNodes from GraphQL-js _can_ have a FragmentSpreadNode
 * but this SelectionNode is specifically typing the `requires` key
 * in a built query plan, where there can't be FragmentSpreadNodes
 * since that info is contained in the `FetchNode.operation`
 */
export type QueryPlanSelectionNode = QueryPlanFieldNode | QueryPlanInlineFragmentNode;

export interface QueryPlanFieldNode {
  readonly kind: 'Field';
  readonly alias?: string;
  readonly name: string;
  readonly selections?: QueryPlanSelectionNode[];
}

export interface QueryPlanInlineFragmentNode {
  readonly kind: 'InlineFragment';
  readonly typeCondition?: string;
  readonly selections: QueryPlanSelectionNode[];
}

export function serializeQueryPlan(queryPlan: QueryPlan) {
  return prettyFormat(queryPlan, {
    plugins: [queryPlanSerializer, astSerializer],
  });
}

export function getResponseName(node: QueryPlanFieldNode): string {
  return node.alias ? node.alias : node.name;
}

/**
 * Converts a GraphQL-js SelectionNode to our newly defined SelectionNode
 *
 * This function is used to remove the unneeded pieces of a SelectionSet's
 * `.selections`. It is only ever called on a query plan's `requires` field,
 * so we can guarantee there won't be any FragmentSpreads passed in. That's why
 * we can ignore the case where `selection.kind === Kind.FRAGMENT_SPREAD`
 */
export const trimSelectionNodes = (
  selections: readonly GraphQLJSSelectionNode[],
): QueryPlanSelectionNode[] => {
  /**
   * Using an array to push to instead of returning value from `selections.map`
   * because TypeScript thinks we can encounter a `Kind.FRAGMENT_SPREAD` here,
   * so if we mapped the array directly to the return, we'd have to `return undefined`
   * from one branch of the map and then `.filter(Boolean)` on that returned
   * array
   */
  const remapped: QueryPlanSelectionNode[] = [];

  selections.forEach((selection) => {
    if (selection.kind === Kind.FIELD) {
      remapped.push({
        kind: Kind.FIELD,
        name: selection.name.value,
        selections:
          selection.selectionSet &&
          trimSelectionNodes(selection.selectionSet.selections),
      });
    }
    if (selection.kind === Kind.INLINE_FRAGMENT) {
      remapped.push({
        kind: Kind.INLINE_FRAGMENT,
        typeCondition: selection.typeCondition?.name.value,
        selections: trimSelectionNodes(selection.selectionSet.selections),
      });
    }
  });

  return remapped;
};
