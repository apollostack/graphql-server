# Apollo REST Data Source

This package exports a ([`RESTDataSource`](https://github.com/apollographql/apollo-server/tree/main/packages/apollo-datasource-rest)) class which is used for fetching data from a REST API and exposing it via GraphQL within Apollo Server.

## Documentation

View the [Apollo Server documentation for data sources](https://www.apollographql.com/docs/apollo-server/features/data-sources/) for more details.

## Usage

To get started, install the `apollo-datasource-rest` package:

```bash
npm install apollo-datasource-rest
```

To define a data source, extend the [`RESTDataSource`](https://github.com/apollographql/apollo-server/tree/main/packages/apollo-datasource-rest) class and implement the data fetching methods that your resolvers require.  Data sources can then be provided via the `dataSources` property to the `ApolloServer` constructor, as demonstrated in the _Accessing data sources from resolvers_ section below.

Your implementation of these methods can call on convenience methods built into the [RESTDataSource](https://github.com/apollographql/apollo-server/tree/main/packages/apollo-datasource-rest) class to perform HTTP requests, while making it easy to build up query parameters, parse JSON results, and handle errors.

```javascript
const { RESTDataSource } = require('apollo-datasource-rest');

class MoviesAPI extends RESTDataSource {
  constructor() {
    super();
    this.baseURL = 'https://movies-api.example.com/';
  }

  async getMovie(id) {
    return this.get(`movies/${id}`);
  }

  async getMostViewedMovies(limit = 10) {
    const data = await this.get('movies', {
      per_page: limit,
      order_by: 'most_viewed',
    });
    return data.results;
  }
}
```

### HTTP Methods

The `get` method on the [RESTDataSource](https://github.com/apollographql/apollo-server/tree/main/packages/apollo-datasource-rest) makes an HTTP `GET` request. Similarly, there are methods built-in to allow for HEAD, POST, PUT, PATCH, and DELETE requests.

```javascript
class MoviesAPI extends RESTDataSource {
  constructor() {
    super();
    this.baseURL = 'https://movies-api.example.com/';
  }

  // an example making an HTTP POST request
  async postMovie(movie) {
    return this.post(
      `movies`, // path
      movie, // request body
    );
  }

  // an example making an HTTP PUT request
  async newMovie(movie) {
    return this.put(
      `movies`, // path
      movie, // request body
    );
  }

  // an example making an HTTP PATCH request
  async updateMovie(movie) {
    return this.patch(
      `movies`, // path
      { id: movie.id, movie }, // request body
    );
  }

  // an example making an HTTP DELETE request
  async deleteMovie(movie) {
    return this.delete(
      `movies/${movie.id}`, // path
    );
  }
}
```

All of the HTTP helper functions (`get`, `head`, `put`, `post`, `patch`, and `delete`) accept a third options parameter, which can be used to set things like headers and referrers. For more info on the options available, see MDN's [fetch docs](https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/fetch#Parameters).

### Intercepting fetches

Data sources allow you to intercept fetches to set headers, query parameters, or make other changes to the outgoing request. This is most often used for authorization or other common concerns that apply to all requests. Data sources also get access to the GraphQL context, which is a great place to store a user token or other information you need to have available.

You can easily set a header on every request:

```javascript
class PersonalizationAPI extends RESTDataSource {
  willSendRequest(request) {
    request.headers.set('Authorization', this.context.token);
  }
}
```

Or add a query parameter:

```javascript
class PersonalizationAPI extends RESTDataSource {
  willSendRequest(request) {
    request.params.set('api_key', this.context.token);
  }
}
```

If you're using TypeScript, make sure to import the `RequestOptions` type:

```javascript
import { RESTDataSource, RequestOptions } from 'apollo-datasource-rest';

class PersonalizationAPI extends RESTDataSource {
  baseURL = 'https://personalization-api.example.com/';

  willSendRequest(request: RequestOptions) {
    request.headers.set('Authorization', this.context.token);
  }
}
```

### Resolving URLs dynamically

In some cases, you'll want to set the URL based on the environment or other contextual values. You can use a getter for this:

```javascript
get baseURL() {
  if (this.context.env === 'development') {
    return 'https://movies-api-dev.example.com/';
  } else {
    return 'https://movies-api.example.com/';
  }
}
```

If you need more customization, including the ability to resolve a URL asynchronously, you can also override `resolveURL`:

```javascript
async resolveURL(request: RequestOptions) {
  if (!this.baseURL) {
    const addresses = await resolveSrv(request.path.split("/")[1] + ".service.consul");
    this.baseURL = addresses[0];
  }
  return super.resolveURL(request);
}
```

### Accessing data sources from resolvers

To give resolvers access to data sources, you pass them as options to the `ApolloServer` constructor:

```javascript
const server = new ApolloServer({
  typeDefs,
  resolvers,
  dataSources: () => {
    return {
      moviesAPI: new MoviesAPI(),
      personalizationAPI: new PersonalizationAPI(),
    };
  },
  context: () => {
    return {
      token: 'foo',
    };
  },
});
```

Apollo Server will put the data sources on the context for every request, so you can access them from your resolvers. It will also give your data sources access to the context. (The reason for not having users put data sources on the context directly is because that would lead to a circular dependency.)

From our resolvers, we can access the data source and return the result:

```javascript
 Query: {
    movie: async (_source, { id }, { dataSources }) => {
      return dataSources.moviesAPI.getMovie(id);
    },
    mostViewedMovies: async (_source, _args, { dataSources }) => {
      return dataSources.moviesAPI.getMostViewedMovies();
    },
    favorites: async (_source, _args, { dataSources }) => {
      return dataSources.personalizationAPI.getFavorites();
    },
  },
```
