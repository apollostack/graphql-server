// This is the "batteries-included" version of `apollo-server-express`. It
// handles creating the Express app and HTTP server for you (using whatever
// version of `express` its dependency pulls in). If you need to customize the
// Express app or HTTP server at all, you just use `apollo-server-express`
// instead.
import express from 'express';
import http from 'http';
import stoppable from 'stoppable';
import {
  ApolloServer as ApolloServerBase,
  CorsOptions,
  ApolloServerExpressConfig,
} from 'apollo-server-express';

export * from './exports';

export interface ServerInfo {
  address: string;
  family: string;
  url: string;
  subscriptionsUrl: string;
  port: number | string;
  subscriptionsPath: string;
  server: http.Server;
}

export class ApolloServer extends ApolloServerBase {
  private httpServer?: stoppable.StoppableServer;
  private cors?: CorsOptions | boolean;
  private onHealthCheck?: (req: express.Request) => Promise<any>;
  private stopGracePeriodMillis: number;

  constructor(
    config: ApolloServerExpressConfig & {
      cors?: CorsOptions | boolean;
      onHealthCheck?: (req: express.Request) => Promise<any>;
      stopGracePeriodMillis?: number;
    },
  ) {
    super(config);
    this.cors = config && config.cors;
    this.onHealthCheck = config && config.onHealthCheck;
    this.stopGracePeriodMillis = config?.stopGracePeriodMillis ?? 10_000;
  }

  private createServerInfo(
    server: http.Server,
    subscriptionsPath?: string,
  ): ServerInfo {
    const serverInfo: any = {
      // TODO: Once we bump to `@types/node@10` or higher, we can replace cast
      // with the `net.AddressInfo` type, rather than this custom interface.
      // Unfortunately, prior to the 10.x types, this type existed on `dgram`,
      // but not on `net`, and in later types, the `server.address()` signature
      // can also be a string.
      ...(server.address() as {
        address: string;
        family: string;
        port: number;
      }),
      server,
      subscriptionsPath,
    };

    // Convert IPs which mean "any address" (IPv4 or IPv6) into localhost
    // corresponding loopback ip. Note that the url field we're setting is
    // primarily for consumption by our test suite. If this heuristic is wrong
    // for your use case, explicitly specify a frontend host (in the `host`
    // option to ApolloServer.listen).
    let hostForUrl = serverInfo.address;
    if (serverInfo.address === '' || serverInfo.address === '::')
      hostForUrl = 'localhost';

    serverInfo.url = require('url').format({
      protocol: 'http',
      hostname: hostForUrl,
      port: serverInfo.port,
      pathname: this.graphqlPath,
    });

    serverInfo.subscriptionsUrl = require('url').format({
      protocol: 'ws',
      hostname: hostForUrl,
      port: serverInfo.port,
      slashes: true,
      pathname: subscriptionsPath,
    });

    return serverInfo;
  }

  public applyMiddleware() {
    throw new Error(
      'To use Apollo Server with an existing express application, please use apollo-server-express',
    );
  }

  public async start(): Promise<void> {
    throw new Error(
      "When using the `apollo-server` package, you don't need to call start(); just call listen().",
    );
  }

  // Listen takes the same arguments as http.Server.listen.
  public async listen(...opts: Array<any>): Promise<ServerInfo> {
    // First start the server and throw if startup fails (eg, schema can't be loaded
    // or a serverWillStart plugin throws).
    await this._start();

    // This class is the easy mode for people who don't create their own express
    // object, so we have to create it.
    const app = express();

    app.disable('x-powered-by');

    // provide generous values for the getting started experience
    super.applyMiddleware({
      app,
      path: '/',
      bodyParserConfig: { limit: '50mb' },
      onHealthCheck: this.onHealthCheck,
      cors:
        typeof this.cors !== 'undefined'
          ? this.cors
          : {
              origin: '*',
            },
    });

    const httpServer = http.createServer(app);
    // `stoppable` adds a `.stop()` method which:
    // - closes the server (ie, stops listening)
    // - closes all connections with no active requests
    // - continues to close connections when their active request count drops to
    //   zero
    // - in 10 seconds (configurable), closes all remaining active connections
    // - calls its callback once there are no remaining active connections
    //
    // If you don't like this behavior, use apollo-server-express instead of
    // apollo-server.
    this.httpServer = stoppable(httpServer, this.stopGracePeriodMillis);

    if (this.subscriptionServerOptions) {
      this.installSubscriptionHandlers(httpServer);
    }

    await new Promise((resolve) => {
      httpServer.once('listening', resolve);
      // If the user passed a callback to listen, it'll get called in addition
      // to our resolver. They won't have the ability to get the ServerInfo
      // object unless they use our Promise, though.
      httpServer.listen(...(opts.length ? opts : [{ port: 4000 }]));
    });

    return this.createServerInfo(httpServer, this.subscriptionsPath);
  }

  public async stop() {
    if (this.httpServer) {
      const httpServer = this.httpServer;
      await new Promise<void>((resolve) => httpServer.stop(() => resolve()));
      this.httpServer = undefined;
    }
    await super.stop();
  }
}
