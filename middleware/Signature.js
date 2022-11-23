const User = require("../models/user");
const { v4: uuid } = require("uuid");
const Web3 = require("web3");
const web3 = new Web3('https://rpc-mumbai.matic.today/');

const updateNonce = async(wallet) => {
    await User.findOneAndUpdate({wallet}, {nonce: uuid()});
}

const SignatureCheck = async(req, res, next) => {
    try {
        const {wallet, signature} = req.body;
        if(!signature) {
            return res.status(400).json({message: "User signature required!"});
        }
        const userData = await User.findOne({wallet});
        const address = web3.eth.accounts.recover(userData.nonce, signature);
        if(address !== wallet) {
            return res.status(403).json({message: "Request Forbidden!"});
        } else {
            console.log("Auth success!");
            updateNonce(wallet);
            next();
        }
    } catch(e) {
        console.log(e);
    }
}

module.exports = {
    SignatureCheck
}