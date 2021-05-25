/* tslint:disable */
/* eslint-disable */
// @generated
// This file was automatically generated and should not be edited.

// ====================================================
// GraphQL mutation operation: ReportServerInfo
// ====================================================

import { GraphQLFormattedError } from 'graphql';

export interface SchemaReportingServerInfoResult {
  data?: ReportServerInfo;
  errors?: Array<GraphQLFormattedError>;
}
export interface ReportServerInfo_me_UserMutation {
  __typename: 'UserMutation';
}

export interface ReportServerInfo_me_ServiceMutation_reportServerInfo_ReportServerInfoError {
  __typename: 'ReportServerInfoError';
  message: string;
  code: ReportServerInfoErrorCode;
}

export interface ReportServerInfo_me_ServiceMutation_reportServerInfo_ReportServerInfoResponse {
  __typename: 'ReportServerInfoResponse';
  inSeconds: number;
  withExecutableSchema: boolean;
}

export type ReportServerInfo_me_ServiceMutation_reportServerInfo =
  | ReportServerInfo_me_ServiceMutation_reportServerInfo_ReportServerInfoError
  | ReportServerInfo_me_ServiceMutation_reportServerInfo_ReportServerInfoResponse;

export interface ReportServerInfo_me_ServiceMutation {
  __typename: 'ServiceMutation';
  /**
   * Report information about a running GraphQL server instance, used for automatic
   * schema reporting. This can optionally include an `executableSchema`, in the
   * form of a GraphQL document, and should only do so if requested explicitly in
   * response to a previous report that designates `withSchema: true`
   */
  reportServerInfo: ReportServerInfo_me_ServiceMutation_reportServerInfo | null;
}

export type ReportServerInfo_me =
  | ReportServerInfo_me_UserMutation
  | ReportServerInfo_me_ServiceMutation;

export interface ReportServerInfo {
  me: ReportServerInfo_me | null;
}

export interface ReportServerInfoVariables {
  info: EdgeServerInfo;
  executableSchema?: string | null;
}

export enum ReportServerInfoErrorCode {
  BOOT_ID_IS_NOT_VALID_UUID = 'BOOT_ID_IS_NOT_VALID_UUID',
  BOOT_ID_IS_REQUIRED = 'BOOT_ID_IS_REQUIRED',
  EXECUTABLE_SCHEMA_ID_IS_NOT_SCHEMA_SHA256 = 'EXECUTABLE_SCHEMA_ID_IS_NOT_SCHEMA_SHA256',
  EXECUTABLE_SCHEMA_ID_IS_REQUIRED = 'EXECUTABLE_SCHEMA_ID_IS_REQUIRED',
  EXECUTABLE_SCHEMA_ID_IS_TOO_LONG = 'EXECUTABLE_SCHEMA_ID_IS_TOO_LONG',
  GRAPH_VARIANT_DOES_NOT_MATCH_REGEX = 'GRAPH_VARIANT_DOES_NOT_MATCH_REGEX',
  GRAPH_VARIANT_IS_REQUIRED = 'GRAPH_VARIANT_IS_REQUIRED',
  LIBRARY_VERSION_IS_TOO_LONG = 'LIBRARY_VERSION_IS_TOO_LONG',
  PLATFORM_IS_TOO_LONG = 'PLATFORM_IS_TOO_LONG',
  RUNTIME_VERSION_IS_TOO_LONG = 'RUNTIME_VERSION_IS_TOO_LONG',
  SERVER_ID_IS_TOO_LONG = 'SERVER_ID_IS_TOO_LONG',
  USER_VERSION_IS_TOO_LONG = 'USER_VERSION_IS_TOO_LONG',
}

/**
 * Edge server info
 */
export interface EdgeServerInfo {
  bootId: string;
  executableSchemaId: string;
  graphVariant: string;
  libraryVersion?: string | null;
  platform?: string | null;
  runtimeVersion?: string | null;
  serverId?: string | null;
  userVersion?: string | null;
}

//==============================================================
// END Enums and Input Objects
//==============================================================
