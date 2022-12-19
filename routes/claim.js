const express = require('express');
const router = express.Router();
const { parse } = require('csv-parse/sync');
const multer = require('multer');
const { validationResult } = require('express-validator');
const Claim = require('../models/claim');
const ApiError = require('../utils/ApiError');
const AuthCheck = require('../middleware/API');
const { web3, globalClaim } = require("./../config/Biconomy");
let { batchId } = require("./../config/Biconomy");

const { 
    handleWhitelistError, 
    handleWhitelistSuccess, 
    handleWhitelistTxhash
} = require('./utilities/handleBatchMint');
const { uniq } = require('lodash');
const Mint = require('../models/mint');

const claimContract =  new web3.eth.Contract(globalClaim.ClaimNFT.abi, globalClaim.ClaimNFT.address);

// const upload = multer({ dest: 'uploads/claim' })
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post("/claim/create",
    AuthCheck,
    upload.single('csv'),
    async (req, res) => {
        try {
            const {
                sessionID,
                wallet,
                supply,
                limit,
                tokenId,
                startDate,
                endDate,
                collectionName,
                collectionDescription,
                contractAddress,
                contractStandard,
                reservedAddress,
                customName,
                exclusive,
                whitelistedAddress
            } =  req.body;

            let addressList = [];
            let allocatedSupply = [];

            if(
                !sessionID && !wallet && wallet !== '0x0' &&
                !collectionName && !collectionDescription &&
                !contractAddress && contractAddress !== '0x0' &&
                !['ERC721', 'ERC1155'].includes(contractStandard)
            ) {
                throw new ApiError(400, "Bad Data!");
            }

            let customUniqueName = customName;

            if(!customName) {
                customUniqueName = sessionID;
            } else {
                const uniqueName = await Claim.findOne({customName: customUniqueName});
                if(uniqueName) {
                    return res.status(400).json({message: "Custom name already exist!"});
                }
            }
            await Claim.create({
                sessionID,
                ownerAddress: wallet,
                supply,
                tokenId,
                startDate,
                endDate,
                limit,
                customName: customUniqueName,
                collectionName,
                collectionDescription,
                contractAddress,
                contractStandard,
                reservedAddress,
                exclusive,
                status: "PENDING"
            });

            // await Mint.findOneAndUpdate({type: contractStandard, tokenId}, {claimable: customUniqueName});

            if(exclusive === 'true' && contractStandard.toUpperCase() === 'ERC1155') {
                const [csvHeader, ...addresses] = req.file.buffer.toString().split('\n');
                if(
                    csvHeader.split(',')[0].trim() !== 'address' &&
                    csvHeader.split(',')[1].trim() !== 'value' &&
                    csvHeader.split(',').length !== 2
                ) {
                    throw new ApiError(400, "Incorrect CSV format!");
                }

    
                for(let line of addresses) {
                    const [address, value] = line.split(',');
                    if(!address.startsWith('0x') && value>=0 && value<=supply) {
                        throw new ApiError(400, "Incorrect Address in CSV!");
                    }
        
                    addressList.push(address);
                    allocatedSupply.push(value);
                }

                const whitelistAddresses = {
                    addressList,
                    allocatedSupply
                }

                await Claim.findOneAndUpdate({sessionID: sessionID}, {whitelistAddresses});

                const BatchSize = 100;
                let totalLength = addressList.length;
                let batchCount = parseInt(totalLength / BatchSize);
                batchCount += ((totalLength % BatchSize) > 0) ? 1 : 0;
                let totalWhitelistedAddress = 0;
                let addressesYetToBeWhitelisted = totalLength;

                let from = 0;
                let to = batchCount > 1 ? BatchSize : totalLength;
                let batchToBeCompleted = batchCount;

                let preparedAddress = [];
                let preparedSupply = [];
                const txPromisesArray = [];
                let transactionHashes = [];

                for(let i = 0; i < batchCount; i++) {
                    preparedAddress = addressList.slice(from, to);
                    preparedSupply = allocatedSupply.slice(from, to);

                    transactionHashes.push({
                        hash:  "0x",
                        status: "NULL",
                        batchNo: i,
                        from,
                        to
                    });

                    //do txn
                    txPromisesArray.push(
                        claimContract.methods.whitelistERC1155(sessionID, preparedAddress, preparedSupply).send({from: process.env.MINTER, batchId: batchId++})
                            .on('transactionHash', (hash) => handleWhitelistTxhash({hash, batchNo: i, from, to, sessionID}))
                            .on('receipt', (receipt) => handleWhitelistSuccess({receipt, batchNo: i, from, to, sessionID}))
                            .on('error', (error) => handleWhitelistError({error, batchNo: i, from, to, sessionID}))
                    );
                    batchToBeCompleted--;
                    totalWhitelistedAddress += (to - from);
                    addressesYetToBeWhitelisted = totalLength - totalWhitelistedAddress;

                    if (batchToBeCompleted > 0) {
                        from = to;
                        to = (addressesYetToBeWhitelisted > BatchSize) ? (to + BatchSize) : (to + addressesYetToBeWhitelisted);
                    }
                }
                console.log(transactionHashes);
                await Claim.findOneAndUpdate({sessionID: sessionID}, {transactionHashes: transactionHashes});

            } else if(exclusive === 'true' && contractStandard.toUpperCase() === 'ERC721') {
                let whitelistAddresses = [whitelistedAddress];
                await Claim.findOneAndUpdate({sessionID: sessionID}, {whitelistAddresses});
            }

            if(exclusive === 'true' && contractStandard.toUpperCase() === 'ERC1155') {
                res.json({ status: true, message: "Claim Page Created! Whitelist in progress!" });
            } else {
                await Claim.findOneAndUpdate({sessionID: sessionID}, {status: "ACTIVE"});
                res.json({ status: true, message: "Claim Page Created!" });
            }
            
        } catch(err) {
            console.log(err);
            const isCreated = await Claim.findOne({sessionID: req.body.sessionID});
            if(isCreated) {
                await Claim.deleteOne({sessionID: req.body.sessionID});
                // await Mint.findOneAndUpdate({type: contractStandard, tokenId}, {claimable: ""});
            }
            const statusCode = err.statusCode ? err.statusCode : 500;
            return res.status(statusCode).json({ error: err?.message });
        }
    }
);

router.post("/claim/activate", AuthCheck, async (req, res) => {
    try {
        const { sessionID, wallet, url, contractStandard, tokenId } = req.body;
    
        if (!sessionID && !wallet && !url) {
            throw new ApiError(400, "Bad Data, missing sessionID");
        }
    
        const check = await Claim.findOne({ customName: url });

        if(check) {
            await Mint.findOneAndUpdate({type: contractStandard.toUpperCase(), tokenId: tokenId}, {claimable: url});
        }
        else {
            throw new ApiError(400, "Details not found!");
        }

        res.json({ status: true,  message: "Claim Page Activated!"});
    } catch(err) {
        console.log(err);
        const statusCode = err.statusCode ? err.statusCode : 500;
        return res.status(statusCode).json({ error: err?.message });
    }
});

router.post("/claim/deactivate", AuthCheck, async (req, res) => {
    try {
        const { wallet, url } = req.body;
    
        if (!url && !wallet) {
            throw new ApiError(400, "Bad Data, missing sessionID");
        }

        const checkUrl = await Claim.findOne({customName: url});
        console.log(checkUrl);
        if(checkUrl) {
            await Mint.findOneAndUpdate({ claimable: url}, {claimable: ""});
            return res.json({ status: true, message: "Deactivated successfully!"});
        } else {
            return res.json({status: false, message: "The url not found!"})
        }

    } catch(err) {
        console.log(err);
        const statusCode = err.statusCode ? err.statusCode : 500;
        return res.status(statusCode).json({ error: err?.message });
    }
});

router.post("/claim", async (req, res) => {
    try {
        const {
            sessionID,
            wallet,
        } = req.body;

        console.log(req.body);
    
        if (!sessionID)
            throw new ApiError(400, "Bad Data, missing sessionID");
    
        const claimPage = await Claim.findOne({ sessionID: sessionID });
    
        if(!claimPage)
            throw new ApiError(400, "Details not found!");
    
        // if(claimPage.status !== 'ACTIVE' || claimPage.status !== 'COMPLETED')
        //     throw new ApiError(400, "Claim Page not ACTIVE!");

        if(claimPage.contractStandard === 'ERC721') {
            await Claim.findOneAndUpdate({ sessionID: sessionID }, { totalClaimed: claimPage.totalClaimed+1, status: "COMPLETED"});
        } else {
            if(claimPage.totalClaimed+1 === supply) {
                await Claim.findOneAndUpdate({sessionID: sessionID}, { totalClaimed: claimPage.totalClaimed+1, status: "COMPLETED"});
            }
            else {
                await Claim.findOneAndUpdate({sessionID: sessionID}, { totalClaimed: claimPage.totalClaimed+1 });
            }
        }

        res.json({ status: true,  message: "Claimed!"});
    } catch(err) {
        console.log(err);
        const statusCode = err.statusCode ? err.statusCode : 500;
        return res.status(statusCode).json({ error: err?.message });
    }
})


router.get('/claim/all/:wallet', async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({ errors: errors.array() });
        };
    
        const { wallet } = req.params;
    
        if (!wallet) {
            throw new ApiError(400, "Bad Data, missing wallet");
        }
    
        const claimPages = await Claim.find({ ownerAddress: wallet });
    
        if (claimPages) {
            return res.status(200).json(claimPages);
        } else {
            throw new ApiError(400, "Details not found!");
        }
    } catch(err) {
        console.log(err);
        const statusCode = err.statusCode ? err.statusCode : 500;
        return res.status(statusCode).json({ error: err?.message });
    }
});


router.get('/claim/:sessionID', async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({ errors: errors.array() });
        };
    
        const { sessionID } = req.params;
    
        if (!sessionID) {
            throw new ApiError(400, "Bad Data, missing sessionID");
        }
    
        const claimPage = await Claim.findOne({ sessionID: sessionID });
    
        if (claimPage) {
            return res.status(200).json(claimPage);
        } else {
            throw new ApiError(400, "Details not found!");
        }
    } catch(err) {
        console.log(err);
        const statusCode = err.statusCode ? err.statusCode : 500;
        return res.status(statusCode).json({ error: err?.message });
    }
});

router.get('/claim/custom/:uniqueName', async(req, res) => {
    try {
        const { uniqueName } = req.params;

        if(!uniqueName) {
            throw new ApiError(400, "Bad data, mission uniqueName");
        }

        const claimPage = await Claim.findOne({ customName: uniqueName });

        if(claimPage && (claimPage.status === "ACTIVE" || claimPage.status === "COMPLETED")) {
            delete claimPage.transactionHashes;
            return res.status(200).json(claimPage);
        } else {
            throw new ApiError(400, "Details not found or inactive!");
        }
    } catch(e) {
        console.log(e);
        const statusCode = e.statusCode ? e.statusCode : 500;
        return res.status(statusCode).json({ error: e?.message });
    }
});

router.get('/claim/custom/checkAvailability/:customName', async(req, res) => {
    try {
        const { customName } = req.params;
        if(!customName) {
            throw new ApiError(400, "Bad data!");
        }

        const claimPage = await Claim.findOne({ customName });

        if(claimPage) {
            return res.status(200).json({ available: false, message: "Custom name not available!"});
        } else {
            return res.status(200).json({ available: true, message: "Custom name available"});
        }
    } catch(e) {
        console.log(e);
        const statusCode = e.statusCode ? e.statusCode : 500;
        return res.status(statusCode).json({ error: e?.message });
    }
});

router.post('/claim/edit', async() => {
    try {
        const {
            sessionID,
            supply,
            startDate,
            endDate,
            collectionName,
            collectionDescription,
            contractAddress,
            contractStandard,
            customName,
        } = req.body;
        
        for(props in req.body) {
            if(!props) {
                throw new ApiError(400, "Bad request data!");
            }
        }

        const claimPage = await Claim.findOne({sessionID: sessionID});

        if(!claimPage) {
            throw new ApiError(400, "Session not found!");
        }

        await Claim.findOneAndUpdate({sessionID: sessionID}, {supply, startDate, endDate, collectionName, collectionDescription, contractAddress, contractStandard, customName});
        return res.status(200).json({message: "Sucessfully updated!"});

    } catch(e) {
        console.log(e);
        const statusCode = e.statusCode ? e.statusCode : 500;
        return res.status(statusCode).json({ error: e?.message });
    }
})

module.exports = router;
