const User = require('../../models/user');
const { web3, gasTank } = require('../../config/Biconomy');
const ApiError = require('../../utils/ApiError');

const DEFAULT_BALANCE = web3.utils.toWei("0", 'ether');
const gasTankABI = gasTank.GasTank;
const gasTankContract = new web3.eth.Contract(gasTankABI.abi, gasTankABI.address);

const getGasTankBalance = async(wallet) => {
    try {
        const userData = await User.findOne({wallet});
        let feeBurnt = userData.gasFeeUtilized;
        const totalFeeDeposited = await gasTankContract.methods.balanceOf(wallet).call();
        if(feeBurnt) {
            return web3.utils.toBN(web3.utils.toBN(DEFAULT_BALANCE).add(web3.utils.toBN(totalFeeDeposited)).sub(web3.utils.toBN(feeBurnt))).toString();
        }
        else {
            return web3.utils.toBN(web3.utils.toBN(DEFAULT_BALANCE).add(web3.utils.toBN(totalFeeDeposited))).toString();
        }
        
    } catch(e) {
        console.log(e);
        throw new ApiError(500, e)
    }

}

const calculateGasPrice = async(receipt) => {
    try {
        const effectiveGasPrice = web3.utils.toBN(receipt.effectiveGasPrice);
        const gasUsed = web3.utils.toBN(receipt.gasUsed);

        return web3.utils.toBN(effectiveGasPrice.mul(gasUsed)).toString();
    } catch(e) {
        console.log(e);
    }
}

module.exports = {
    getGasTankBalance,
    calculateGasPrice
};