import retry from 'async-retry';
import * as elasticsearch from '../lib/elasticsearch-utils';
import { getEnv } from '../lib/common';

let es;
let env;

export const handler = async (event) => {
  if (!env) {
    env = await getEnv([
      'ELASTICSEARCH_HOST',
      'ELASTICSEARCH_HTTPAUTH_ENCRYPTED',
    ]);
  }

  const {
    method,
    operation,
    params,
  } = JSON.parse(event.Records[0].body);

  if (!es) {
    es = elasticsearch.client({
      host: env.ELASTICSEARCH_HOST,
      httpAuth: env.ELASTICSEARCH_HTTPAUTH,
    });
  }

  let attemptsTaken;

  await retry(async (bail, attempt) => {
    attemptsTaken = attempt;
    await es[method](params);
  }, {
    retries: 5,
    randomize: true,
  });

  if (attemptsTaken > 1) {
    console.log(`ElasticSearch proxy for operation ${operation} took ${attemptsTaken} attempts`);
  }
};
