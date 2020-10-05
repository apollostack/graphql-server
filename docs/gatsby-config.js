const themeOptions = require('gatsby-theme-apollo-docs/theme-options');

module.exports = {
  pathPrefix: '/docs/apollo-server',
  plugins: [
    {
      resolve: 'gatsby-theme-apollo-docs',
      options: {
        ...themeOptions,
        root: __dirname,
        subtitle: 'Apollo Server',
        description: 'A guide to using Apollo Server',
        githubRepo: 'apollographql/apollo-server',
        defaultVersion: '2',
        versions: {
          '1': 'version-1',
        },
        sidebarCategories: {
          null: [
            'index',
            'getting-started',
            '[Changelog](https://github.com/apollographql/apollo-server/blob/main/CHANGELOG.md)',
            '[Apollo Federation](https://www.apollographql.com/docs/federation/)',
          ],
          'Defining a Schema': [
            'schema/schema',
            'schema/scalars-enums',
            'schema/unions-interfaces',
            'schema/directives',
            'schema/creating-directives',
          ],
          'Fetching Data': [
            'data/resolvers',
            'data/data-sources',
            'data/errors',
            'data/file-uploads',
            'data/subscriptions',
          ],
          Testing: ['testing/mocking', 'testing/testing', 'testing/graphql-playground'],
          Performance: ['performance/caching', 'performance/apq'],
          Security: ['security/authentication', 'security/terminating-ssl'],
          Integrations: [
            'integrations/middleware',
            'integrations/plugins',
          ],
          Deployment: [
            'deployment/heroku',
            'deployment/lambda',
            'deployment/netlify',
            'deployment/app-engine',
            'deployment/azure-functions',
          ],
          Monitoring: ['monitoring/metrics', 'monitoring/health-checks'],
          'API Reference': [
            'api/apollo-server',
            'api/plugin/usage-reporting',
            'api/plugin/schema-reporting',
            'api/plugin/inline-trace',
            'api/graphql-tools',
            '[@apollo/federation](https://www.apollographql.com/docs/federation/api/apollo-federation/)',
            '[@apollo/gateway](https://www.apollographql.com/docs/federation/api/apollo-gateway/)',
          ],
          Appendices: [
            'proxy-configuration',
            'migration-two-dot',
            'migration-file-uploads',
            'migration-engine-plugins',
          ],
        },
      },
    },
  ],
};
