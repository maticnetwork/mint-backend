const JWT = require('jsonwebtoken');

const JWTAuth = async(req, res, next) => {
    const token = req.headers['x-auth-token'];
    if(!token) return res.status(401).json({status: false, message: 'No token provided!'});
    const allowedOrigin = [
        "https://mint.dehidden.com",
    ];

    try {
        if(!allowedOrigin.indexOf(req.get('origin')) > -1 && token === process.env.FRONTEND_API) {
            next();
        } else {
        JWT.verify(token, process.env.JWT_SECRET);
        next();
        }
    } catch(e) {
        console.log(e);
        res.status(500).json({status: false, message: e});
    }
}

module.exports = { JWTAuth };