const express = require('express');
const { validationResult } = require('express-validator');
const router = express.Router();

const { web3 } = require('./../../config/Biconomy');
const BatchMintUpload = require('../../models/batchMint');
const ERC721BatchMintAbi = require('../../abis/ERC721BatchMint.json');
const CreateCollectionAbi = require('../../abis/CreateCollection.json');
const MinterWalletAbi = require('../../abis/MinterWallet.json');
const catchAsync = require('../../utils/catchAsync');
const AuthCheck = require('../../middleware/API');
const ApiError = require('../../utils/ApiError');
const { BatchSize, MinterWalletContractAddress, BatchMintERC721ContractAddress, CreateCollectionContractAddress } = require('../../global');
const { 
    handleTransactionError, 
    handleTransactionHash, 
    handleTransactionSuccess,
    refundGas
} = require('./../utilities/handleBatchMint');
const { JWTAuth } = require("../../middleware/JWTValidation");
const RateLimit = require('../../middleware/RateLimiter');
let batchId = 10000;
let requestCount = 0;
const BN = web3.utils.BN;
const nft721 = new web3.eth.Contract(ERC721BatchMintAbi, BatchMintERC721ContractAddress);
const createCollection = new web3.eth.Contract(CreateCollectionAbi, CreateCollectionContractAddress);
const minterWallet = new web3.eth.Contract(MinterWalletAbi, MinterWalletContractAddress);

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

const BatchMintAPI = (redisClient) => {
router.post("/batch/deposit",
    JWTAuth, AuthCheck,
    async (req, res) => {
        try {
            const { wallet, sessionID } = req.body;

            if (!sessionID || !wallet) {
                throw new ApiError(400, "Bad Data, missing wallet or sessionID");
            }

            const file = await BatchMintUpload.findOne({
                wallet: wallet,
                sessionID: sessionID
            });

            if (!file)
                throw new ApiError(400, "Invalid wallet or sessionID");

            const depositedBalanceString = await minterWallet.methods.balanceOf(wallet, sessionID).call();
            const depositedBalance = new BN(depositedBalanceString);
            const estimatedGas = new BN(file.estimatedGas);
            
            if (!depositedBalance.gte(estimatedGas)) {
                await BatchMintUpload.findOneAndUpdate(
                    { sessionID, wallet },
                    { $set: { 
                        "status.gas": 'INSUFFICIENT', 
                        depositedAmount: depositedBalance.toString()
                    }}
                );

                return res.status(200).json({ isDeposited: false, message: 'Insufficient Gas Deposited!' });
            } else
                await BatchMintUpload.findOneAndUpdate(
                    { sessionID, wallet },
                    { $set: { 
                        "status.gas": 'DEPOSITED', 
                        depositedAmount: depositedBalance.toString()
                    }}
                );

            console.log(`Session ${sessionID} - Deposited Gas`);
            return res.status(200).json({ isDeposited: true, message: 'Gas Deposited!' });
        } catch(err) {
            console.log(err);
            const statusCode = err.statusCode ? err.statusCode : 500;
            return res.status(statusCode).json({ error: err?.message });
        }
    }
);

router.post("/batch/mint",
    JWTAuth, AuthCheck, (req, res, next) => RateLimit(redisClient, req, res, next),
    catchAsync(
        async (req, res) => {
            try {
                req.setTimeout(0);
                const data = req.body;
                const { wallet, sessionID, network } = data;

                if (!wallet || !network || !sessionID) {
                    return res.status(400).json({
                        message: 'One of the request body is empty'
                    });
                }


                try {
                    const file = await BatchMintUpload.findOne({
                        wallet: wallet,
                        sessionID: sessionID
                    });
                    if (!file)
                        throw new ApiError(400, "Invalid wallet or sessionID");

                    if(file.status?.ipfs !== 'CONFIRMED') throw new ApiError(400, "files not uploaded to IPFS");
                    if(file.contractAddress === '0x0') throw new ApiError(400, "Contract Address not found");
                    
                    if (['PENDING', 'CONFIRMED'].includes(file.status.mint))
                        throw new ApiError(400, `Already minted for sessionID: ${sessionID}`);

                    const depositedBalanceString = await minterWallet.methods.balanceOf(wallet, sessionID).call();
                    const depositedBalance = new BN(depositedBalanceString);
                    const estimatedGas = new BN(file.estimatedGas);

                    if (!depositedBalance.gte(estimatedGas)) {
                        await BatchMintUpload.findOneAndUpdate(
                            { sessionID, wallet },
                            { $set: { 
                                "status.gas": 'INSUFFICIENT', 
                                depositedAmount: depositedBalance.toString()
                            }}
                        );
        
                        return res.status(400).json({ message: 'Insufficient Gas Deposited!' });
                    } else {
                        await BatchMintUpload.findOneAndUpdate(
                            { sessionID, wallet },
                            { $set: { 
                                "status.gas": 'DEPOSITED', 
                                "status.mint": 'PENDING', 
                                depositedAmount: depositedBalance.toString()
                            }}
                        );
                    }

                    const tokenUri = JSON.parse(file.hash).metadataHash
                    const filesCount = file.filesCount;
                    let batchCount = parseInt(filesCount / BatchSize);
                    batchCount += ((filesCount % BatchSize) > 0) ? 1 : 0;

                    if (network === "mainnet") {
                        try {
                            requestCount++;
                            let from = 0;
                            let to = batchCount > 1 ? BatchSize-1 : filesCount-1;
                            let batchToBeCompleted = batchCount;
                            let totalNFTMinted = 0;
                            let nftYetToBeMinted = filesCount;

                            let mintPromiseArray = [];
                            let transactionHashes = [];
                            for (let batchNo = 0; batchNo < batchCount; batchNo++) {
                                transactionHashes.push({
                                    hash: "0x0",
                                    status: 'NULL',
                                    batchNo: batchNo,
                                    gasConsumed: '0',
                                    from,
                                    to
                                })

                                batchToBeCompleted--;
                                totalNFTMinted += (to - from) + 1;
                                nftYetToBeMinted = filesCount - totalNFTMinted;

                                if (batchToBeCompleted > 0) {
                                    from = to + 1;
                                    to = (nftYetToBeMinted > BatchSize) ? (to + BatchSize) : (to + nftYetToBeMinted);
                                }
                            }

                            from = 0;
                            to = batchCount > 1 ? BatchSize-1 : filesCount-1;
                            batchToBeCompleted = batchCount;
                            totalNFTMinted = 0;
                            nftYetToBeMinted = filesCount;

                            await BatchMintUpload.findOneAndUpdate({ sessionID }, { transactionHashes });

                            for (let i = 0; i < batchCount; i++) {
                                let localCount = requestCount;
                                console.log(from, to);
                                mintPromiseArray.push(
                                    createCollection.methods.mintUnderCollection(
                                        file.contractAddress, 
                                        file.sessionID,
                                    // nft721.methods.mint(
                                        wallet, 
                                        from, 
                                        to, 
                                        tokenUri
                                    ).send({ from: process.env.MINTER, batchId: batchId++ })
                                        .on('transactionHash', (hash) => handleTransactionHash({ hash, localCount, batchNo: i, from: from, to: to, wallet, sessionID }))
                                        .on('receipt', (receipt) => handleTransactionSuccess({ receipt, localCount, batchNo: i, wallet, sessionID }))
                                        .on('error', (error) => handleTransactionError({ error, localCount, batchNo: i, from: from, to: to, wallet, sessionID }))
                                );

                                batchToBeCompleted--;
                                totalNFTMinted += (to - from) + 1;
                                nftYetToBeMinted = filesCount - totalNFTMinted;

                                if (batchToBeCompleted > 0) {
                                    from = to + 1;
                                    to = (nftYetToBeMinted > BatchSize) ? (to + BatchSize) : (to + nftYetToBeMinted);
                                }
                                await sleep(300);
                            }

                            Promise.all(mintPromiseArray)
                                .then(async (_) => {
                                    let totalGasUsed = _.reduce((accumulator, currentTx) => {
                                        const gasUsed = new BN(currentTx.gasUsed);
                                        const effectiveGasPrice = new BN(currentTx.effectiveGasPrice);
                                        const gasConsumed = gasUsed.mul(effectiveGasPrice);

                                        return gasConsumed.add(accumulator);
                                    }, (new BN(0)));

                                    let refundAmount = "0";
                                    const estimatedGas = new BN(file.estimatedGas);
                                    if (totalGasUsed.gte(estimatedGas)) 
                                        totalGasUsed = estimatedGas
                                    else
                                        refundAmount = depositedBalance.sub(totalGasUsed).toString();

                                    refundGas(wallet, refundAmount, totalGasUsed.toString(), estimatedGas.toString(), sessionID)
                                    // .then(async _ => {
                                    //     await BatchMintUpload.findOneAndUpdate({ sessionID }, { 
                                    //         refundAmount,
                                    //         totalGasUsed: totalGasUsed.toString(),
                                    //         minted: true 
                                    //     });
                                    // })
                                    .catch(async e => {
                                        console.log(e);
                                        await BatchMintUpload.findOneAndUpdate({ sessionID },
                                        { $set: { 
                                            refundAmount,
                                            totalGasUsed: totalGasUsed.toString(),
                                            "status.refund": 'FAILED', 
                                        }});
                                    })
                                    
                                })
                                .catch(e => {
                                    console.log(`Mint Promise Array: `, e);
                                })

                        } catch (e) {
                            console.log(e);
                            return res.status(500).json(e);
                        }

                    } else {
                        throw new ApiError(400, "Wrong Network")
                    }

                    return res.status(200).json({ message: 'Transaction initiated!' });
                } catch(err) {
                    console.log(err);
                    const statusCode = err.statusCode ? err.statusCode : 500;
                    return res.status(statusCode).json({ error: err?.message });
                }

            } catch(err) {
                console.log(err);
                const statusCode = err.statusCode ? err.statusCode : 500;
                return res.status(statusCode).json({ error: err?.message });
            }
        }
    )
);


router.get('/batch/checkStatus/:sessionID',JWTAuth, AuthCheck, (req, res, next) => RateLimit(redisClient, req, res, next), async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({ errors: errors.array() });
        }
    
        const { sessionID } = req.params;
    
        if (!sessionID) {
            throw new ApiError(400, "Bad Data, missing sessionID");
        }
    
        const fileStatus = await BatchMintUpload.findOne({ sessionID: sessionID });
    
        if (fileStatus) {
            return res.status(200).json(fileStatus.status);
        } else {
            throw new ApiError(400, "Details not found!");
        }
    } catch(err) {
        console.log(err);
        const statusCode = err.statusCode ? err.statusCode : 500;
        return res.status(statusCode).json({ error: err?.message });
    }
});

router.get('/batch/collection/:wallet',JWTAuth, AuthCheck, (req, res, next) => RateLimit(redisClient, req, res, next), async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({ errors: errors.array() });
        }

        const { wallet } = req.params;
    
        if (!wallet) {
            throw new ApiError(400, "Bad Data, missing wallet");
        }
    
        const batches = await BatchMintUpload.find({ wallet: wallet });
    
        if (batches) {
            return res.status(200).json(batches);
        } else {
            throw new ApiError(400, "Details not found!");
        }
    } catch(err) {
        console.log(err);
        const statusCode = err.statusCode ? err.statusCode : 500;
        return res.status(statusCode).json({ error: err?.message });
    }
});

router.post('/batch/updateCollectionData',JWTAuth, AuthCheck, (req, res, next) => RateLimit(redisClient, req, res, next), async (req, res) => {

    try {
        const { wallet, sessionID } = req.body;

        if(!wallet || !sessionID) {
            throw new ApiError(400, "Bad Data, Wallet address, Contract address or SessionID missing");
        }
        const check = await BatchMintUpload.findOne({ sessionID: sessionID });
        if(check?.status?.s3 === 'NULL') {
            throw new ApiError(400, "No file uploaded");
        } 

        const collectionAddress = await createCollection.methods.collectionRecords(wallet, sessionID).call();
        console.log(collectionAddress);
        if(collectionAddress !== '0x0000000000000000000000000000000000000000') {
            await BatchMintUpload.findOneAndUpdate({ sessionID }, { contractAddress: collectionAddress });
        } else {
            return res.status(200).json({isCreated: false});
        }

        return res.status(200).json({ isCreated: true, staus: 'ok', message: 'Contract Address for the session updated'});
    } catch(err) {
        console.log(err);
        const statusCode = err.statusCode ? err.statusCode : 500;
        return res.status(statusCode).json({ error: err?.message });
    }
});

/* route GET /api/batch/getEstimatedGas/:sessionID
    * @desc Get estimated gas for a batch
    * @access Private - AuthCheck middleware
    * @param sessionID - sessionID of the batch
    * @returns estimated gas 
*/
router.get('/batch/getEstimatedGas/:sessionID',
 JWTAuth, AuthCheck, (req, res, next) => RateLimit(redisClient, req, res, next), async (req, res) => {
    try{
        const { sessionID } = req.params;

        if(!sessionID) {
            throw new ApiError(400, "Bad Data, SessionID missing");
        }

        const batch = await BatchMintUpload.findOne({ sessionID: sessionID });

        if(!batch) {
            throw new ApiError(400, "SessionID not found");
        }
        if(!batch?.estimatedGas){
            throw new ApiError(400, "Estimated Gas not found");
        }

        return res.status(200).json({ estimatedGas: batch.estimatedGas });
    }
    catch(error){
        console.log(error);
        const statusCode = error.statusCode ? error.statusCode : 500;
        return res.status(statusCode).json({ error: error?.message });
    }
})
return router;
}

module.exports = BatchMintAPI;
