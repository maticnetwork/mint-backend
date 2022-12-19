const WINDOW = 24 * 60 * 60 * 1000; // 1 day in ms
const ALLOWED_REQUESTS = 10000; // 10,000 requests per API token

const SESSION = 5 // 5 sessions per API token

const RateLimit = async(redisClientPromise, req, res, next) => {
    const token = await req.headers['x-api-key'];
    const session = await req.body.sessionID !== undefined ? req.body.sessionID : false;
    const newSession = await req.sessionID !== undefined ? req.sessionID : false;

    const allowedOrigin = [
        "http://localhost:3000",
        "https://staging.mintnft.today",
        "https://mintnft.today",
        "https://0xmint.io",
        "https://staging.0xmint.io",
        "https://app.0xmint.io",
        "https://app-staging.0xmint.io",
        "https://mint.dehidden.com/"
      ];

    if ((allowedOrigin.indexOf(req.get("origin")) > -1)) {
        next();
        return;
    }

    if (!token) {
        return res.status(401).json({
            status: 'error',
            message: 'Access denied. No token provided.'
        });
    }

    try {
        const redisClient = await redisClientPromise;

        const reqDetails = await redisClient.get(token);

        
        if(session){
            const sessionDetails = await redisClient.get(session);
            if(sessionDetails){
                if(sessionDetails !== token){
                    return res.status(429).json({
                        status: 'error',
                        message: 'Access denied. Invalid Token.'
                    });
                }
            } 
        }
          
        if(newSession){
            const reqDetailsJSON = reqDetails ? JSON.parse(reqDetails) : false;
            if(reqDetailsJSON){
                if(reqDetailsJSON.sessionsRemaining !== 0){
                    reqDetailsJSON.sessionsRemaining -= 1;
                    await redisClient.set(token, JSON.stringify(reqDetailsJSON));
                    await redisClient.set(newSession,token);
                }
                else {
                    return res.status(401).json({
                        status: 'error',
                        message: 'Rate limit exceeded. Please try again later.'
                    });
                }
            }
            else {
                await redisClient.set(newSession,token);
            }
        }  
      

        if(!reqDetails) {
            await redisClient.set(token, JSON.stringify({
                timestamp: + new Date(),
                requestsRemaining: ALLOWED_REQUESTS - 1,
                sessionsRemaining: newSession ? SESSION - 1: SESSION
            }));
        } else {
            const reqDetailsJSON = JSON.parse(reqDetails);
            if (reqDetailsJSON.timestamp + WINDOW <= (+ new Date())) {
                await redisClient.set(token, JSON.stringify({
                    timestamp: + new Date(),
                    requestsRemaining: ALLOWED_REQUESTS - 1,
                    sessionsRemaining: newSession ? SESSION - 1: SESSION
                }));
            } else if (reqDetailsJSON.requestsRemaining == 0) {
                return res.status(401).json({
                    status: 'error',
                    message: 'Rate Limit Exceded'
                });
            } else {
                await redisClient.set(token, JSON.stringify({
                    ...reqDetailsJSON,
                    requestsRemaining: reqDetailsJSON.requestsRemaining - 1,
                    sessionsRemaining: newSession ? reqDetailsJSON.sessionsRemaining - 1 : reqDetailsJSON.sessionsRemaining
                }));
            }
        }
        next();
    } catch(err) {
        return res.status(500).json({
            status: 'error',
            message: 'Invalid token.'
        });
    }

}

module.exports = RateLimit