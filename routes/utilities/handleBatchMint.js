const BatchMintUpload = require("../../models/batchMint");
const Claim = require("../../models/claim");
let { web3, batchId, web3N, globalClaim } = require('../../config/Biconomy');
const MinterWalletAbi = require('../../abis/MinterWallet.json');
const ERC721BatchMintAbi = require('../../abis/ERC721BatchMint.json');
const CollectionAbi = require('../../abis/CreateCollection.json');
const { BatchMintERC721ContractAddress, CreateCollectionContractAddress, MinterWalletContractAddress, BatchSize } = require("../../global");
const { deleteFromS3 } = require("../../utils/S3");
let nft721 = new web3.eth.Contract(ERC721BatchMintAbi, BatchMintERC721ContractAddress);
let collectionContract = new web3.eth.Contract(CollectionAbi, CreateCollectionContractAddress);
const minterWallet = new web3N.eth.Contract(MinterWalletAbi, MinterWalletContractAddress);
const claimContract =  new web3.eth.Contract(globalClaim.ClaimNFT.abi, globalClaim.ClaimNFT.address);
const BN = web3.utils.BN;

/**
 * @param {string=} hash - Transaction Hash
 * @param {number=} localCount - Local Count
 * @param {number=} batchNo - Batch No
 * @param {string=} wallet - Wallet Address
 * @param {string=} sessionID - Session ID
 */
async function handleTransactionHash(data) {
    if(+data.localCount !== -1)
        console.log(`Request no. ${data.localCount} Batch no: ${data.batchNo} - Transaction hash:`, data.hash);
    else
        console.log(`Retrying Batch no: ${data.batchNo} - Transaction hash:`, data.hash);

    try {
        if (data.hash) {
            const updated_file = await BatchMintUpload.findOneAndUpdate(
                { sessionID: data.sessionID, "transactionHashes.batchNo": data.batchNo },
                { $set: { 
                    "transactionHashes.$.status": 'PENDING',
                    "transactionHashes.$.hash" : data.hash,
                }}
            );

            if(!updated_file) {
                let obj = {
                    hash: data.hash,
                    status: 'PENDING',
                    batchNo: data.batchNo,
                    gasConsumed: '0',
                    from: data.from,
                    to: data.to
                }
                await BatchMintUpload.findOneAndUpdate({ sessionID: data.sessionID },
                    { $push: { transactionHashes: obj } } 
                );
            }
        }
    } catch (e) {
        console.log(e);
    }
}

/**
 * @param {object=} receipt - Transaction Recipt Object
 * @param {number=} localCount - Local Count
 * @param {number=} batchNo - Batch No
 * @param {string=} wallet - Wallet Address
 * @param {string=} sessionID - Session ID
 */
async function handleTransactionSuccess(data) {
    if(+data.localCount !== -1)
        console.log(`Request no. ${data.localCount} Batch no:  ${data.batchNo} - Success:`, data.receipt.transactionHash);
    else
        console.log(`Retrying Batch no: ${data.batchNo} - Success:`, data.receipt.transactionHash);

    try {
        const gasUsed = new BN(data.receipt.gasUsed);
        const effectiveGasPrice = new BN(data.receipt.effectiveGasPrice);

        await BatchMintUpload.findOneAndUpdate(
            { sessionID: data.sessionID, "transactionHashes.hash": data.receipt.transactionHash },
            { $set: { 
                "transactionHashes.$.status": 'CONFIRMED',
                "transactionHashes.$.gasConsumed": gasUsed.mul(effectiveGasPrice).toString(),
                // contractAddress: BatchMintERC721ContractAddress
            }}
        );
    } catch (e) {
        console.log(e);
    }
}

/**
 * @param {object=} error - Error Object
 * @param {number=} localCount - Local Count
 * @param {number=} batchNo - Batch No
 * @param {string=} wallet - Wallet Address
 * @param {string=} sessionID - Session ID
 */
async function handleTransactionError(data) {
    try {
        if(+data.localCount !== -1)
            console.log(`Request no. ${data.localCount}  Batch no: ${data.batchNo} - Error:`, data.error);
        else
            console.log(`Retrying Batch no: ${data.batchNo} - Error:`, data.error);

        const isItInPending = await BatchMintUpload.findOne(
            { sessionID: data.sessionID, transactionHashes: {$elemMatch: {batchNo: data.batchNo, status: 'PENDING'}}}
        );


        if(!isItInPending) {
            const failed_res = await BatchMintUpload.findOneAndUpdate(
                { sessionID: data.sessionID, "transactionHashes.batchNo": data.batchNo },
                { $set: { "transactionHashes.$.status": 'FAILED' }}
            );

            if(!failed_res) {
                let obj = {
                    hash: null,
                    status: 'FAILED',
                    batchNo: data.batchNo,
                    from: data.from,
                    to: data.to
                }

                await BatchMintUpload.findOneAndUpdate({ sessionID: data.sessionID },
                    { $push: { transactionHashes: obj } }
                );
            }
        }
    } catch (e) {
        console.log(e);
    }
}

/**
 * @param {string=} wallet - Wallet Address
 * @param {string=} estimatedGas - Estimated Gas Used for Mint
 * @param {string=} sessionID - Session ID
 */
async function refundGas(wallet, refundAmount, totalGasUsed, estimatedGas, sessionID) {
    try {
        console.log("Refunding", estimatedGas, "Gas for sessionID:", sessionID);
        const file = await BatchMintUpload.findOneAndUpdate(
            { sessionID }, 
            { $set: { refundAmount, totalGasUsed, "status.mint": 'CONFIRMED' }}
        );

        if(['CONFIRMED','PENDING'].includes(file.status.refund)) {
            console.log("Refund in progress for sessionID:", sessionID);
        } else {
            let totalGas;
            try {
                totalGas = await minterWallet.methods.refundGas(wallet, totalGasUsed, sessionID).estimateGas({from: process.env.MINTER});
                const gasPrice = await web3.eth.getGasPrice();
                console.log(totalGas, gasPrice);
                console.log('Batch id', batchId);
                await minterWallet.methods
                    .refundGas(wallet, totalGasUsed, sessionID)
                    .send({ from: process.env.MINTER, batchId: batchId++, gas: totalGas.toString(), gasPrice: gasPrice})
                    .on('transactionHash', async (hash) => {
                        console.log(`Refund Gas of sessionID: ${sessionID} Transaction hash - ${hash}`)
                        if (hash) {
                            await BatchMintUpload.findOneAndUpdate({ sessionID }, { 
                                refundHash: hash, 
                                "status.refund": "PENDING",
                            });
                        }
                    })
                    .on('receipt', async (receipt) => {
                        console.log(`Refund Gas of sessionID: ${sessionID} - Success: ${receipt.transactionHash}`)
                        await BatchMintUpload.findOneAndUpdate({ sessionID },
                        { $set: { 
                            refundHash: receipt.transactionHash,
                            "status.refund": "CONFIRMED",
                        }});
                        console.log(`Deleting from S3 for session: ${sessionID}`);
                    })
                    .on('error', async (error) => {
                        console.log(`Refund Gas of sessionID: ${sessionID} Error - ${JSON.stringify(error, null, 4)}`)
                        const isRefundInPending = await BatchMintUpload.findOne({sessionID, "status.refund": "PENDING"});
                        if(!isRefundInPending) {
                            await BatchMintUpload.findOneAndUpdate({ sessionID }, { $set: { "status.refund": "FAILED" }});
                        }
                    });
            } catch (e) {
                console.log(`Refund Gas of sessionID: ${sessionID} - Success: Gas uitlized is more than deposited balance!`);
                if(e.message === "execution reverted: Gas uitlized is more than deposited balance!") {
                    await BatchMintUpload.findOneAndUpdate({ sessionID },
                        { $set: { 
                            refundHash: '0x0',
                            "status.refund": "CONFIRMED",
                        }});
                    console.log(`Deleting from S3 for session: ${sessionID}`);
                }
            }
            
    
            await deleteFromS3(sessionID, null);
        }
    } catch (e) {
        console.log(e);
        throw e;
    }
}

/**
 * @param {string=} wallet - Wallet Address
 * @param {string=} hash - CID
 * @returns {Promise<string>=} estimated gas
 */
async function estimateGas(wallet, hash) {
    return await collectionContract.methods.mintUnderCollection(BatchMintERC721ContractAddress, "Session_id", wallet, 1, 100, `${hash}/metadata`).estimateGas({
        from: process.env.MINTER,
    });
}

async function handleWhitelistTxhash(data) {
    try {
        console.log(`Whitelist Batch no: ${data.batchNo} - Transaction hash:`, data.hash);
        await Claim.findOneAndUpdate({sessionID: data.sessionID, "transactionHashes.batchNo": data.batchNo}, { 
            $set: { 
                "transactionHashes.$.status": 'PENDING',
                "transactionHashes.$.hash" : data.hash,
            }
        });
    } catch(e) {
        console.log(e);
    }
    
}

async function handleWhitelistSuccess(data) {
    try {
        console.log(`Whitelist Batch no: ${data.batchNo} - Success:`, data.receipt.transactionHash);
        await Claim.findOneAndUpdate({sessionID: data.sessionID, "transactionHashes.batchNo": data.batchNo}, 
            { $set: { 
            "transactionHashes.$.status": 'CONFIRMED',
        }});
    } catch(e) {
        console.log(e);
    }
}

async function handleWhitelistError(data) {
    try {
        console.log(data);
        console.log(`Whitelist Batch no: ${data.batchNo} - Error:`, data.error);
        await Claim.findOneAndUpdate({sessionID: data.sessionID, "transactionHashes.batchNo": data.batchNo}, 
            { $set: {
                "transactionHashes.$.status": 'FAILED',
            }}
        );
    } catch(e) {
        console.log(e);
    }
}

async function retryWhitelistTxn(data, hashData) {
    try {
        let preparedAddress = data.whitelistAddresses.addressList.slice(hashData.from, hashData.to);
        let preparedSupply = data.whitelistAddresses.allocatedSupply.slice(hashData.from, hashData.to);

        claimContract.methods.whitelistERC1155(data.sessionID, preparedAddress, preparedSupply).send({from: process.env.MINTER, batchId: batchId++})
            .on('transactionHash', (hash) => handleWhitelistTxhash({hash, batchNo: hashData.batchNo, from:hashData.from, to:hashData.to, sessionID: data.sessionID}))
            .on('receipt', (receipt) => handleWhitelistSuccess({receipt, batchNo:hashData.batchNo, from:hashData.from, to:hashData.to, sessionID: data.sessionID}))
            .on('error', (error) => handleWhitelistError({error, batchNo: hashData.batchNo, from:hashData.from, to:hashData.to, sessionID: data.sessionID}));
    } catch(e) {
        console.log(e);
    }
}


module.exports = {
    handleTransactionHash,
    handleTransactionError,
    handleTransactionSuccess,
    estimateGas,
    refundGas,
    handleWhitelistError,
    handleWhitelistSuccess,
    handleWhitelistTxhash,
    retryWhitelistTxn
}
