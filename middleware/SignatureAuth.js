const User = require("../models/user");
const Web3 = require("web3");
const web3 = new Web3('https://rpc-mumbai.matic.today/');

const SignatureAuth = async(req, res, next) => {
    try {
        const {wallet} = req.body;
        const signature = req.headers["x-api-sign"];
        if(!signature) {
            return res.status(400).json({message: "User signature required!"});
        }
        const userData = await User.findOne({wallet});
        const address = web3.eth.accounts.recover(userData.secretKeyHash, signature);
        if(address !== wallet) {
            return res.status(403).json({message: "Request Forbidden!"});
        } else {
            console.log("Auth success!");
            next();
        }
    } catch(e) {
        console.log(e);
    }
}

module.exports = {
    SignatureAuth
}