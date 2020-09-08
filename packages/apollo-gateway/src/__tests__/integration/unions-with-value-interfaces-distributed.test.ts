import gql from 'graphql-tag';
import { astSerializer, queryPlanSerializer } from '../../snapshotSerializers';
import { execute, ServiceDefinitionModule } from '../execution-utils';

expect.addSnapshotSerializer(astSerializer);
expect.addSnapshotSerializer(queryPlanSerializer);

const videos = [{ id: 1, url: 'https://foobar.com/videos/1' }];
const news = [{ id: 1, url: 'https://foobar.com/news/1' }];
const reviews = [{ id: 1, url: 'https://foobar.com/reviews/1' }];
const audios = [{ id: 1, audioUrl: 'https://foobar.com/audios/1' }];

const contentService: ServiceDefinitionModule = {
  name: 'contentService',
  typeDefs: gql`
    type Query {
      content: [Content!]!
      articles: [Article!]!
    }
    union Content = Video | News | Audio
    union Article = News | Review
    extend type Video @key(fields: "id") {
      id: ID @external
    }
    extend type Audio @key(fields: "id") {
      id: ID @external
    }
    extend type News @key(fields: "id") {
      id: ID @external
    }
    extend type Review @key(fields: "id") {
      id: ID @external
    }
  `,
  resolvers: {
    Query: {
      content() {
        return [
          ...news.map((a) => ({ ...a, type: 'News' })),
          ...audios.map(({ id }) => ({ id, type: 'Audio' })),
          ...videos.map(({ id }) => ({ id, type: 'Video' })),
        ];
      },
      articles() {
        return [
          ...news.map((a) => ({ ...a, type: 'News' })),
          ...reviews.map(({ id }) => ({ id, type: 'Review' })),
        ];
      },
    },
    Content: {
      __resolveType(object) {
        return object.type;
      },
    },
    Article: {
      __resolveType(object) {
        return object.type;
      },
    },
  },
};

const articleService: ServiceDefinitionModule = {
  name: 'articleService',
  typeDefs: gql`
    interface WebResource {
      url: String
    }
    type News implements WebResource @key(fields: "id") {
      id: ID
      url: String
    }
    type Review implements WebResource @key(fields: "id") {
      id: ID
      url: String
    }
  `,
  resolvers: {
    News: {
      __resolveReference(object) {
        return news.find((news) => news.id === parseInt(object.id, 10));
      },
      id(object) {
        return object.id;
      },
      url(object) {
        return object.url;
      },
    },
    Review: {
      __resolveReference(object) {
        return reviews.find((review) => review.id === parseInt(object.id, 10));
      },
      id(object) {
        return object.id;
      },
      url(object) {
        return object.url;
      },
    },
  },
};

const videoService: ServiceDefinitionModule = {
  name: 'videoService',
  typeDefs: gql`
    interface WebResource {
      url: String
    }
    type Video implements WebResource @key(fields: "id") {
      id: ID
      url: String
    }
  `,
  resolvers: {
    Video: {
      __resolveReference(object) {
        return videos.find((video) => video.id === parseInt(object.id, 10));
      },
      id(object) {
        return object.id;
      },
      url(object) {
        return object.url;
      },
    },
  },
};

const audioService: ServiceDefinitionModule = {
  name: 'audioService',
  typeDefs: gql`
    type Audio @key(fields: "id") {
      id: ID
      audioUrl: String
    }
  `,
  resolvers: {
    Audio: {
      __resolveReference(object) {
        return audios.find((audio) => audio.id === parseInt(object.id, 10));
      },
      id(object) {
        return object.id;
      },
      audioUrl(object) {
        return object.audioUrl;
      },
    },
  },
};

it('handles unions from different services which implements value interfaces', async () => {
  const query = `#graphql
    query {
      content {
        ... on WebResource {
          url
        }
        ... on Audio {
          url: audioUrl
        }
      }
      articles {
        ... on WebResource {
          url
        }
      }
    }
  `;

  const { queryPlan, errors, data } = await execute({ query }, [
    contentService,
    videoService,
    audioService,
    articleService,
  ]);
  expect(errors).toBeUndefined();

  expect(queryPlan).toMatchInlineSnapshot(`
    QueryPlan {
      Sequence {
        Fetch(service: "contentService") {
          {
            content {
              __typename
              ... on Video {
                __typename
                id
              }
              ... on News {
                __typename
                id
              }
              ... on Audio {
                __typename
                id
              }
            }
            articles {
              __typename
              ... on News {
                __typename
                id
              }
              ... on Review {
                __typename
                id
              }
            }
          }
        },
        Parallel {
          Flatten(path: "content.@") {
            Fetch(service: "videoService") {
              {
                ... on Video {
                  __typename
                  id
                }
              } =>
              {
                ... on Video {
                  url
                }
              }
            },
          },
          Flatten(path: "content.@") {
            Fetch(service: "articleService") {
              {
                ... on News {
                  __typename
                  id
                }
              } =>
              {
                ... on News {
                  url
                }
              }
            },
          },
          Flatten(path: "content.@") {
            Fetch(service: "audioService") {
              {
                ... on Audio {
                  __typename
                  id
                }
              } =>
              {
                ... on Audio {
                  url: audioUrl
                }
              }
            },
          },
          Flatten(path: "articles.@") {
            Fetch(service: "articleService") {
              {
                ... on News {
                  __typename
                  id
                }
                ... on Review {
                  __typename
                  id
                }
              } =>
              {
                ... on News {
                  url
                }
                ... on Review {
                  url
                }
              }
            },
          },
        },
      },
    }
  `);
  expect(data).toEqual({
    content: [
      { url: 'https://foobar.com/news/1' },
      { url: 'https://foobar.com/audios/1' },
      { url: 'https://foobar.com/videos/1' },
    ],
    articles: [
      { url: 'https://foobar.com/news/1' },
      { url: 'https://foobar.com/reviews/1' },
    ],
  });
});
