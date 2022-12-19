const express = require('express');
const router = express.Router();

const { check, validationResult } = require('express-validator');

const Autograph = require("../../models/utilities/autograph")
const Asset = require("../../models/mint")



router.post("/token",
[
    check('wallet', 'Please enter a valid wallet').not().isEmpty(),
    check('txhash', 'Please enter a valid txhash').not().isEmpty(),
    check('content', 'Please enter a valid content').not().isEmpty()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { txhash, content } = req.body;
    try {
        const asset = await Asset.findOne({ transactionHash: txhash })
        const autographed = await Autograph.findOne({ transactionHash: txhash })
        if (!asset && !autographed) {
            return res.status(400).json({
                error: "Asset not found"
            });
        }
        const autographedNFT = autographed ? true : false
        if(autographedNFT){
            await Autograph.updateOne({ transactionHash: txhash }, {
                unlockables: content
            });
    } else {
        await Asset.updateOne({ transactionHash: txhash }, {
            unlockables: content
        });
    }
        return res.json({ success: true, msg: "Voila! Added Secret Content" });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            error: error
        });
    }
}
)


module.exports = router;