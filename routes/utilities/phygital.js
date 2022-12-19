const express = require('express');
const router = express.Router();

const Phygital = require('../../models/utilities/phygital');
const Mint = require('../../models/mint')
const Autograph = require('../../models/utilities/autograph')

const { check, validationResult } = require('express-validator');
const { default: axios } = require('axios');

// const AuthCheck = require('../../middleware/API');
// const axios = require('axios');

router.post("/order",
    [
        check('wallet', 'Wallet is required').notEmpty(),
        check('email', 'Email is required').isEmail().notEmpty(),
        check('txhash', 'Transaction Hash is required').notEmpty(),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { wallet, email, product ,type, color, contractaddress, size, txhash, metadata, tokenID } = req.body;
        try {
            const mint = await Mint.findOne({ transactionHash: txhash })
            const autograph = await Autograph.findOne({ transactionHash: txhash })
          
            if(!mint && !autograph){
                return res.status(400).json({
                    error: "Asset not found"
                });
            }
            const autographedNFT = autograph ? true : false
            const orderData = {
                email,
                product,
                type,
                color, 
                size,
                wallet,
                contractAddress: contractaddress,
                tokenID,
                metadata
            }
            
            const newUser = new Phygital({
                wallet: wallet,
                orderData: orderData,
                transactionHash: txhash
            });
            await newUser.save();
            if(autographedNFT){
                await Autograph.findOneAndUpdate({
                    transactionHash: txhash
                  }, {
                    phygital: true
                })
            } else {
                await Mint.findOneAndUpdate({
                    transactionHash: txhash
                }, {
                    phygital: true
                })
            }

            await axios.request({
                url: 'https://phygitalapi.dehidden.com/v1/api/user/order',
                method:"POST",
                data: orderData,
                headers: {
                    "x-api-key": process.env.PHYGITALS_API
                }
            }).then(async(response) => {
                console.log(response.data);
                await Phygital.findOneAndUpdate({txhash: txhash}, {isEmailSent: true});
                return res.status(200).json({
                    message: "Order placed successfully"
                });
            }).catch((err) => {
                console.log(err);
                return res.status(500).json({
                    error: "Order failed"
                });
            });
          
        }
        catch (err) {
            console.error(err.message);
            res.status(500).send(err.message);
        }
    }
)

module.exports = router;