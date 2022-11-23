const { connect } = require("mongoose");
const { createClient } = require('redis');
const Redis = require('ioredis');


require('dotenv').config()
const {initAgenda} = require("./Agenda");



const URL = process.env.MONGODB

const connectDB = async () => {
  try {
    const mongoURI = URL
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    };

    //Init MongoDB
    await connect(mongoURI, options);
    console.log("MongoDB Connected...");
    console.log(process.env.REDIS_DB.split(':')[0]);
    //Init Redis
    let redisClient;
    try {
      if(process.env.LOCAL) {
        redisClient = new Redis([
          {
            host: process.env.REDIS_DB.split(':')[0],
            port: 6379,
            retryStrategy: (times) => {
              if(times > 2) {
                return null;
              } else {
                return 200;
              }
            }
          }
        ]
        )
      } else {
        redisClient = new Redis.Cluster([
          {
            host: process.env.REDIS_DB.split(':')[0],
            port: 6379,
            retryStrategy: (times) => {
              if(times > 2) {
                return null;
              } else {
                return 200;
              }
            }
          }
        ]
        )
      }
      
      redisClient.set("isConnected", true);
      redisClient.get('isConnected').then((res) => console.log('Redis', res))

      initAgenda();

      return redisClient;
    } catch(e) {
      console.log('Error on redis init', e);
    }
    

    //Init Agenda
   
  } catch (err) {
    console.log(err);
    console.error(err.message);
    process.exit(1);
  }
};

module.exports = connectDB;