# serverless-elasticsearch-proxy

A Serverless service that proxies calls to ElasticSearch via an SQS interface. Clients queue work in the form of SQS messages and the Lambda makes a request to ElasticSearch using the Official ElasticSearch client library for Node.js, [elasticsearch-js](https://github.com/elastic/elasticsearch-js), with the given method and params.

## Overview

The service is composed of 2 Lambda functions, 1 SQS queue, 1 IAM KMS Encryption Key.

### Lambda function 1: `elasticsearch_proxy`

This is the primary function of the service. It is triggered by SQS messages in the queue. The message describes a request to be made to ElasticSearch via the [elasticsearch-js](https://github.com/elastic/elasticsearch-js). Messages are attempted up to 3 times before they are sent to the DLQ if configured.

### Lambda function 2: `cleanup_fuel_prices`

This is a function that runs on an interval (currently 1 hour) to delete `fuel_price` documents from ElasticSearch that are older than 48 hours.

---

## Usage

Clients send JSON messages to the SQS queue with the following keys:

* `method` - the method to call on the elasticsearch-js client
* `params` - the params object to pass to the method call on the elasticsearch-js client
* `operation` - an identifier for the operation (similar to how `queryWithContext` is used in non-Serverless GB services)

Messages should also specify the following `MessageAttributes` keys. These attributes may be used for message routing in the future.

* `method` - same as above
* `operation` - same as above

### Example

To make the request from the [ES docs example for the `bulk` method](https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/api-reference.html#api-bulk), the SQS message body should look something like this (edited for semi-realistic index/type):

```
{
  "operation": "exampleBulkRequest"
  "method": "bulk",
  "params": {
    body: [
      { index:  { _index: 'items', _type: 'price', _id: 1 } },
      { title: 'foo' },
      { update: { _index: 'items', _type: 'price', _id: 2 } },
      { doc: { title: 'foo' } },
      { delete: { _index: 'items', _type: 'price', _id: 3 } },
    ]
  }
}
```

To queue this message, a Node.js client might do something like this:

```
import AWS from 'aws-sdk';

const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });

const method = 'bulk';
const operation = 'exampleBulkRequest';

sqs.sendMessage({
  QueueUrl: 'https://sqs.us-east-1.amazonaws.com/12341234123412341234/my-queue',
  MessageBody: JSON.stringify({
    operation,
    method,
    params: {
      index: 'items',
      type: 'price',
      _source: false,
      body: [
        { index:  { _index: 'items', _type: 'price', _id: 1 } },
        { title: 'foo' },
        { update: { _index: 'items', _type: 'price', _id: 2 } },
        { doc: { title: 'foo' } },
        { delete: { _index: 'items', _type: 'price', _id: 3 } },
      ],
    },
  }),
  MessageAttributes: {
    method: {
      DataType: 'String',
      StringValue: method,
    },
    operation: {
      DataType: 'String',
      StringValue: operation,
    },
  },
}, (err, data) => {
    // ...
});
```

---

## Deployment

Take care to use the correct AWS Credential "profile". By default, this service assumes you have the credentials set in `~/.aws/credentials` with the profile name equal to that environment's AWS Account Name (`staging`). If your profiles are named differently, be sure to use the `--profile` argument.

Note: Run these commands in the `serverless` directory

    serverless deploy --stage [stage|prod]

Specify profile override

    serverless deploy --stage stage --profile staging

## Logs

Logs are located in CloudWatch Logs. They can be viewed from your browser via the AWS Console:

* [`prefix=/aws/lambda/serverless-elasticsearch-proxy-*`](https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#logs:prefix=/aws/lambda/serverless-elasticsearch-proxy-)

You can interactively tail the logs for a given Lambda function by using the Serverless command line tools like so:

    serverless logs -f <function_name> -t

i.e.

    serverless logs -f elasticsearch_proxy -t

---

## Development

Note: Run these commands in the `serverless` directory

Lambdas can be invoked locally as long as your local environment has AWS credentials with the required IAM roles and permissions. Invoke locally and optionally specify event data like so:

    serverless invoke local -f elasticsearch_proxy -d '{"foo":"bar"}'

For more advanced options when invoking locally, see the [Serverless Doc: Invoke Local](https://serverless.com/framework/docs/providers/aws/cli-reference/invoke-local/)

### Secrets with KMS

On the initial deploy, you must first comment out the `awsKmsKeyArn` property in `serverless.yml`. Once the first deploy is finished, go to the [Encryption Keys section of the IAM Dashboard in the AWS Console](https://console.aws.amazon.com/iam/home?region=us-east-1#/encryptionKeys/us-east-1) and copy the ARN for the `serverless-elasticsearch-proxy-secrets`. Update the value of the `aws-kms-key-arn-secrets` property (with the copied ARN) in the appropriate config file (i.e. `config.stage.yml` for staging). Uncomment the `awsKmsKeyArn` property in `serverless.yml` and redeploy.

#### Add a new encrypted secret

The following command outputs the encrypted and base64-encoded string representation of the secret provided with the `--plaintext` option. Add the result to the function environment in `serverless.yml` and commit to source control.

    aws kms encrypt --key-id alias/serverless-elasticsearch-proxy-secrets --output text --query CiphertextBlob --plaintext 'mysecret'

Note: you must have the necessary IAM permission and be added to `resources.Resources.SecretsKMSKey.KeyPolicy.Statement[0].Principal.AWS` in `serverless.yml` (requires a deploy by existing user from that list).

---

## TODO

* Use a FIFO SQS queue, each client's messages can be processed as separate streams (using message group IDs) so one doesn't block the other
* Allow client to specify ES host... if auth is needed, it should be either added, encrypted, to the Serverless config or retrieved from some other AWS service
* Allow client to specify API version if not already possible(?)
* Add stack output for the SQS queue name/arn/url
