const { TwitterApi } = require("twitter-api-v2");


const TOKENS = {
    appKey: process.env.TWITTER_CLIENT,
    appSecret: process.env.TWITTER_SECRET,
};

const TOKENS_COPE = {
    appKey: process.env.TWITTER_CLIENT_COPE,
    appSecret: process.env.TWITTER_SECRET_COPE, 
}
  
 

const requestClient = new TwitterApi({ ...TOKENS });
const requestCopeClient = new TwitterApi({ ...TOKENS_COPE });

module.exports = {
    requestClient,
    requestCopeClient,
    TOKENS_COPE,
    TOKENS
};