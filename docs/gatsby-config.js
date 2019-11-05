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
        defaultVersion: 2,
        versions: {
          1: 'version-1',
        },
        sidebarCategories: {
          null: [
            'index',
            'getting-started',
            '[Changelog](https://github.com/apollographql/apollo-server/blob/master/CHANGELOG.md)',
          ],
          'Defining a Schema': [
            'schema/schema',
            'schema/scalars-enums',
            'schema/unions-interfaces',
            'schema/directives',
            'schema/creating-directives',
          ],
          'Fetching Data': [
            'data/data',
            'data/data-sources',
            'data/errors',
            'data/file-uploads',
            'data/subscriptions',
          ],
          Federation: [
            'federation/introduction',
            'federation/concerns',
            'federation/core-concepts',
            'federation/implementing',
            'federation/advanced-features',
            'federation/errors',
            'federation/migrating-from-stitching',
            'federation/federation-spec',
            'federation/metrics',
          ],
          Testing: ['testing/mocking', 'testing/testing', 'testing/graphql-playground'],
          Performance: ['performance/caching', 'performance/apq'],
          Security: ['security/authentication', 'security/proxy-configuration', 'security/terminating-ssl'],
          Integrations: ['integrations/middleware'],
          Deployment: [
            'deployment/heroku',
            'deployment/lambda',
            'deployment/now',
            'deployment/netlify',
            'deployment/azure-functions',
          ],
          Monitoring: ['monitoring/metrics', 'monitoring/health-checks'],
          'API Reference': [
            'api/apollo-server',
            'api/apollo-federation',
            'api/apollo-gateway',
            'api/graphql-tools',
          ],
          Migration: [
            'migration-two-dot',
            'migration-engine',
            'migration-file-uploads',
          ],
        },
      },
    },
  ],
};
