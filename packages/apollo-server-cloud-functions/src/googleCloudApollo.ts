import {
  GraphQLOptions,
  HttpQueryError,
  runHttpQuery,
} from 'apollo-server-core';
import { Headers } from 'apollo-server-env';
import { Request, Response } from 'express';
import { ValueOrPromise } from 'apollo-server-types';

export interface CloudFunctionGraphQLOptionsFunction {
  (req?: Request, res?: Response): ValueOrPromise<GraphQLOptions>;
}

export function graphqlCloudFunction(
  options: GraphQLOptions | CloudFunctionGraphQLOptionsFunction,
): any {
  if (!options) {
    throw new Error('Apollo Server requires options.');
  }

  if (arguments.length > 1) {
    throw new Error(
      `Apollo Server expects exactly one argument, got ${arguments.length}`,
    );
  }

  const graphqlHandler: any = (req: Request, res: Response): void => {
    const hasPostBody = req.body && Object.keys(req.body).length > 0;
    if (req.method === 'POST' && !hasPostBody) {
      res.status(400).send('POST body missing.');
      return;
    }

    runHttpQuery([req, res], {
      method: req.method,
      options: options,
      query: hasPostBody ? req.body : (req.query as any),
      request: {
        url: req.url,
        method: req.method,
        headers: new Headers(req.headers as any), // ? Check if this actually works
      },
    }).then(
      ({ graphqlResponse, responseInit }) => {
        res
          .status(200)
          .set(responseInit.headers)
          .send(graphqlResponse);
      },
      (error: HttpQueryError) => {
        if ('HttpQueryError' !== error.name) {
          res.status(400).send(error);
          return;
        }
        res
          .status(error.statusCode)
          .set(error.headers)
          .send(error.message);
      },
    );
  };

  return graphqlHandler;
}
