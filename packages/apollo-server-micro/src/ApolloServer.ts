import {
  ApolloServerBase,
  GraphQLOptions,
  processFileUploads,
} from 'apollo-server-core';
import { ServerResponse } from 'http';
import { send } from 'micro';
import { renderPlaygroundPage } from '@apollographql/graphql-playground-html';
import { parseAll } from 'accept';

import { graphqlMicro } from './microApollo';
import { MicroRequest } from './types';

export interface ServerRegistration {
  path?: string;
  disableHealthCheck?: boolean;
  onHealthCheck?: (req: MicroRequest) => Promise<any>;
}

export class ApolloServer extends ApolloServerBase {
  // Extract Apollo Server options from the request.
  async createGraphQLServerOptions(
    req: MicroRequest,
    res: ServerResponse,
  ): Promise<GraphQLOptions> {
    return super.graphQLServerOptions({ req, res });
  }

  // Prepares and returns an async function that can be used by Micro to handle
  // GraphQL requests.
  public createHandler({
    path,
    disableHealthCheck,
    onHealthCheck,
  }: ServerRegistration = {}) {
    // In case the user didn't bother to call and await the `start` method, we
    // kick it off in the background (with any errors getting logged
    // and also rethrown from graphQLServerOptions during later requests).
    this.ensureStarting();

    return async (req, res) => {
      this.graphqlPath = path || '/graphql';

      if (typeof processFileUploads === 'function') {
        await this.handleFileUploads(req, res);
      }

      (await this.handleHealthCheck({
        req,
        res,
        disableHealthCheck,
        onHealthCheck,
      })) ||
        this.handleGraphqlRequestsWithPlayground({ req, res }) ||
        (await this.handleGraphqlRequestsWithServer({ req, res })) ||
        send(res, 404, null);
    };
  }

  // This integration supports file uploads.
  protected supportsUploads(): boolean {
    return true;
  }

  // This integration supports subscriptions.
  protected supportsSubscriptions(): boolean {
    return true;
  }

  // If health checking is enabled, trigger the `onHealthCheck`
  // function when the health check URL is requested.
  private async handleHealthCheck({
    req,
    res,
    disableHealthCheck,
    onHealthCheck,
  }: {
    req: MicroRequest;
    res: ServerResponse;
    disableHealthCheck?: boolean;
    onHealthCheck?: (req: MicroRequest) => Promise<any>;
  }): Promise<boolean> {
    let handled = false;

    if (
      !disableHealthCheck &&
      req.url === '/.well-known/apollo/server-health'
    ) {
      // Response follows
      // https://tools.ietf.org/html/draft-inadarei-api-health-check-01
      res.setHeader('Content-Type', 'application/health+json');

      if (onHealthCheck) {
        try {
          await onHealthCheck(req);
        } catch (error) {
          send(res, 503, { status: 'fail' });
          handled = true;
        }
      }

      if (!handled) {
        send(res, 200, { status: 'pass' });
        handled = true;
      }
    }

    return handled;
  }

  // If the `playgroundOptions` are set, register a `graphql-playground` instance
  // (not available in production) that is then used to handle all
  // incoming GraphQL requests.
  private handleGraphqlRequestsWithPlayground({
    req,
    res,
  }: {
    req: MicroRequest;
    res: ServerResponse;
  }): boolean {
    let handled = false;

    if (this.playgroundOptions && req.method === 'GET') {
      const accept = parseAll(req.headers);
      const types = accept.mediaTypes as string[];
      const prefersHTML =
        types.find(
          (x: string) => x === 'text/html' || x === 'application/json',
        ) === 'text/html';

      if (prefersHTML) {
        const middlewareOptions = {
          endpoint: this.graphqlPath,
          subscriptionEndpoint: this.subscriptionsPath,
          ...this.playgroundOptions,
        };
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        send(res, 200, renderPlaygroundPage(middlewareOptions));
        handled = true;
      }
    }

    return handled;
  }

  // Handle incoming GraphQL requests using Apollo Server.
  private async handleGraphqlRequestsWithServer({
    req,
    res,
  }: {
    req: MicroRequest;
    res: ServerResponse;
  }): Promise<boolean> {
    let handled = false;
    const url = req.url.split('?')[0];
    if (url === this.graphqlPath) {
      const graphqlHandler = graphqlMicro(() => {
        return this.createGraphQLServerOptions(req, res);
      });
      const responseData = await graphqlHandler(req, res);
      send(res, 200, responseData);
      handled = true;
    }
    return handled;
  }

  // If file uploads are detected, prepare them for easier handling with
  // the help of `graphql-upload`.
  private async handleFileUploads(req: MicroRequest, res: ServerResponse) {
    if (typeof processFileUploads !== 'function') {
      return;
    }

    const contentType = req.headers['content-type'];
    if (
      this.uploadsConfig &&
      contentType &&
      contentType.startsWith('multipart/form-data')
    ) {
      req.filePayload = await processFileUploads(req, res, this.uploadsConfig);
    }
  }
}
