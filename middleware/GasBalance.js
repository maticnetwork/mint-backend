const User = require("../models/user");
const ObjectId = require('mongodb').ObjectId;
const { web3 } = require('./../config/Biconomy');
const { getGasTankBalance } = require('./../routes/utilities/gasTank');

const checkGasBalance = async(req) => {
    const token = await req.headers["x-api-key"];
    const { wallet } = req.body;
    const lastDate = new Date("2022-12-11");
    const now =  Date.now();

    if(now > lastDate) {
        return await gasCheck(wallet);
    } else {
        const check = await User.findOne({
            socialApi: { $elemMatch: { api: token, _id: {$lte : objectIdWithTimestamp("2022-12-01")} }} ,
        }, {socialApi: 1});
        if(check) {
            return true;
        } else {
            console.log('doing new api key check....')
            return await gasCheck(wallet);
        }
    }
};

const gasCheck = async(wallet) => {
    const gasTankBalance = await getGasTankBalance(wallet);
    if(web3.utils.toBN(gasTankBalance).lte(web3.utils.toBN('0'))) {
        return false;
    }

    return true;
}

function objectIdWithTimestamp(timestamp) {
    /* Convert string date to Date object (otherwise assume timestamp is a date) */
    if (typeof(timestamp) == 'string') {
        timestamp = new Date(timestamp);
    }

    /* Convert date object to hex seconds since Unix epoch */
    var hexSeconds = Math.floor(timestamp/1000).toString(16);

    /* Create an ObjectId with that hex timestamp */
    var constructedObjectId = ObjectId(hexSeconds + "0000000000000000");

    return constructedObjectId
}

module.exports = {
    checkGasBalance
}