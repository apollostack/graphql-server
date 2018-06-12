import { graphqlCloudflare } from './cloudflareApollo';

import { ApolloServerBase } from 'apollo-server-core';
export { GraphQLOptions, GraphQLExtension } from 'apollo-server-core';
import { GraphQLOptions } from 'apollo-server-core';

export class ApolloServer extends ApolloServerBase {
  //This translates the arguments from the middleware into graphQL options It
  //provides typings for the integration specific behavior, ideally this would
  //be propagated with a generic to the super class
  async createGraphQLServerOptions(request: Request): Promise<GraphQLOptions> {
    return super.graphQLServerOptions({ request });
  }

  public async listen() {
    const graphql = this.createGraphQLServerOptions.bind(this);
    addEventListener('fetch', (event: FetchEvent) => {
      event.respondWith(graphqlCloudflare(graphql)(event.request));
    });
    return await { url: '', port: null };
  }
}
