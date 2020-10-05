---
title: Deploying with App Engine
sidebar_title: App Engine
description: Deploying your GraphQL server to App Engine
---
Google App Engine is a common Platform as a Service solution that allows users to deploy a functioning GraphQl endpoint in Google-managed data centers. 

## Prerequisites

The following must be done before following this guide:

- Setup an [Google Cloud](https://cloud.google.com/) account.
- Install [Google Cloud SDK](https://cloud.google.com/sdk/docs).
- [Configure the Google Cloud SDK with user credentials](https://cloud.google.com/sdk/gcloud/reference/auth/login).

## Setting up a new Google App Engine application

Before deploying, a new application must be set up. To do this, log in to the [Google Cloud Console](https://console.cloud.google.com/). Then from the navigation menu `App Engine > Dashboard` in the top left. The name you choose will be referred to later as `<GCLOUD_APP_NAME>`, so be sure to replace it in the later sections.

![Create Application Screenshot](../images/deployment/app-engine/create-application.png)

Follow the prompts to set the region then click `Create App`
We will want to change the Language to `Node.js` and the Enviorment to `Flexible`, Standard does not support websockets and GraphQl subscriptions require that functionality. If Subscriptions are not needed you can choose `Standard` as your app enviorment. More about the diffrences between the two enviorments [here](https://cloud.google.com/appengine/docs/the-appengine-environments).

![Create Application Settings Screenshot](../images/deployment/app-engine/settings.png)

## Setting up the project

For App Engine, projects can be set up using any of the `apollo-server` HTTP variants (like express, hapi, etc).

App Engine requires a `app.yaml` file for configuring your instance. Create a `app.yaml` file in the root directory:

```yaml
runtime: nodejs
env: flex

# Use these settings to save costs for testing
# manual_scaling:
#  instances: 1
# resources:
#   cpu: 1
#   memory_gb: 0.5
#   disk_size_gb: 10
```

Next to configure `apollo-server` to use a port defined by App Engine at runtime, the `listen` function in your setup file can be called with a port defined by the `PORT` environment variable:

```js
server.listen({ port: process.env.PORT || 4000 }).then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`);
});
```

## Deploying the project

To deploy projects to App engine run the following command: `gcloud app deploy`.

View deployments of your project by using `gcloud app browse` this will open your deployed instance to the GraphQl Playground in a browser.