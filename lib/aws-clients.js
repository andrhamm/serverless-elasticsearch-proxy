import AWS from 'aws-sdk';

export const kms = new AWS.KMS({ apiVersion: '2014-11-01' });
