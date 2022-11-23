const express = require('express');
const router = express.Router();

const { check, validationResult } = require("express-validator");
const Autograph = require('../../models/utilities/autograph');
const Gift = require('../../models/utilities/gift');
const Phygital = require('../../models/utilities/phygital');

router.get("/fetch",[
    check('wallet', 'Wallet is required').notEmpty(),
    check("txhash", "Transaction Hash is required").notEmpty(),
],async(req,res) => {
    const errors = validationResult(req);  
    if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
    }
    const { wallet, txhash } = req.query;
    try {
        const autograph = await Autograph.findOne({ txhash: txhash,wallet: wallet });
        const gift = await Gift.findOne({ wallet: wallet, txhash: txhash });
        const phygital = await Phygital.findOne({ wallet: wallet, txhash: txhash });
        return res.status(200).json({
            autograph: autograph,
            gift: gift,
            phygital: phygital
        })
    }
    catch(error){
        return res.status(500).json({
            error: error
        })
    }
})


module.exports = router