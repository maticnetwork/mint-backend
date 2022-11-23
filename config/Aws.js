const S3SyncClient = require('s3-sync-client');
const { S3Client, Bucket } = require("@aws-sdk/client-s3")

const client = new S3Client({ 
  region: 'us-east-1'
  //region: process.env.AWS_REGION,
  //credentials: { 
  //  accessKeyId: process.env.AWS_ACCESS_KEY, 
   // secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY 
  //},  
});

const { sync } = new S3SyncClient({ client: client });

module.exports = {
    sync,
    S3: client
}
