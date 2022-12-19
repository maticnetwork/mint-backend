const Agenda = require('agenda');
const Mint = require('../models/mint');
const axios = require('axios');
let { web3, batchId, networkId } = require('./../config/Biconomy');
const BatchMintUpload = require('../models/batchMint');
const Claim = require('../models/claim');
const { retryCollectionMint } = require('../routes/apiContract');
const { 
    BatchSize, 
    BatchMintERC721ContractAddress, 
    CreateCollectionContractAddress,
    MinterWalletContractAddress
} = require('../global');
const { 
    handleTransactionError, 
    handleTransactionHash, 
    estimateGas,
    handleTransactionSuccess, 
    retryWhitelistTxn,
    refundGas
} = require('../routes/utilities/handleBatchMint');
const BN = web3.utils.BN;

const MinterWalletAbi = require('../abis/MinterWallet.json');
const CreateCollectionAbi = require('../abis/CreateCollection.json');
const { result } = require('lodash');
const Collection = require('../models/collection');
const createCollection = new web3.eth.Contract(CreateCollectionAbi, CreateCollectionContractAddress);
const minterWallet = new web3.eth.Contract(MinterWalletAbi, MinterWalletContractAddress);

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

/**
 * @param {object=} dbResult - Result Object from MongoDB
 * @param {string=} status - Transaction Status (CONFIRMED or PENDING or FAILED)
 * @returns {number=} Transaction Count
 */
const countTransactions = (dbResult, status) => (
    dbResult.reduce((prevTxAggregate, currentTxObj) =>
            prevTxAggregate + currentTxObj.transactionHashes.reduce((prevResult, currentTx) =>
            currentTx.status === status ? ++prevResult : prevResult
        ,0)
    ,0)
);

/**
 * @param {string=} hash - Transaction Hash
 * @returns {object=} Axios Response Object
 */
const biconomyTxCheck = (hash) => (
    axios.get('https://api.biconomy.io/api/v1/meta-tx/resubmitted', {
        headers: { 'Content-Type': 'application/json' },
        params: {
            transactionHash: hash,
            networkId: networkId 
        }
    })
)

/**
 * @param {object=} result - Axios Response Object
 * @returns {object=} Token Id Object
 */
const fetchBiconomy = async (result) => {
    let newHash = result.data.data.newHash;
    const receipt = await web3.eth.getTransactionReceipt(newHash);
    const topics = receipt.logs[0].topics;
    return web3.eth.abi.decodeLog([{
        type: 'address',
        name: 'from',
        indexed: true
    }, {
        type: 'address',
        name: 'to',
        indexed: true
    }, {
        type: 'uint256',
        name: 'value',
        indexed: true
    }],
        receipt.logs[0].data,
        [topics[1], topics[2], topics[3]]
    );
}

/**
 * @param {string=} hash - Transaction Hash
 */
const pollBiconomyAndUpdateSingleMint = async (hash) => {
    try {
        console.log('SingleMint Hash in polling.....', hash);

        biconomyTxCheck(hash)
        .then(async (result) => {
            if (result.data.data.newStatus === 'CONFIRMED') {
                const decode = await fetchBiconomy(result);
                await Mint.findOneAndUpdate({ transactionHash: hash }, { transactionHash: result.data.data.newHash, status: 'CONFIRMED', tokenId: decode.value });
            } else if (result.data.data.newStatus === 'FAILED') {
                await Mint.findOneAndUpdate({ transactionHash: hash }, { transactionHash: result.data.data.newHash, status: 'FAILED' });
            }
        }).catch((e) => console.log(e));

    } catch (e) {
        console.log(e);
    }
}

/**
 * @param {string=} hash - Transaction Hash
 */
const pollBiconomyAndUpdateRefundStatus = async (hash) => {
    try {
        console.log('Refund Hash in polling.....', hash);
        biconomyTxCheck(hash)
        .then(async (result) => {
            if (result?.data?.data?.newStatus === 'CONFIRMED') {
                console.log(`CONFIRMED - ${hash}`)
                await BatchMintUpload.findOneAndUpdate(
                    { refundHash: hash }, 
                    { 
                        refundHash: result.data.data.newHash, 
                        "status.refund": 'CONFIRMED'
                    });
            } else if (result.data.data.newStatus === 'FAILED') {
                console.log(`FAILED - ${hash}`)
                await BatchMintUpload.findOneAndUpdate(
                    { refundHash: hash }, 
                    { 
                        refundHash: result.data.data.newHash,
                        "status.refund": 'FAILED'
                    });
            }
        }).catch((e) => console.log(e));
    } catch (e) {
        console.log(e);
    }
}

/**
 * @param {string=} hash - Transaction Hash
 * @param {string=} wallet - Wallet Address
 * @param {string=} sessionID - Session ID
 */
const pollBiconomyAndUpdateBatchMint = async (hash, wallet, sessionID) => {
    try {
        console.log('BatchMint Hash in polling.....', hash);

        biconomyTxCheck(hash)
        .then(async (result) => {
            if (result.data.data.newStatus === 'CONFIRMED') {
                console.log(`CONFIRMED - ${hash}`)
                let estimatedGas = new BN(await estimateGas(wallet, sessionID));
                let gasPrice = new BN(result.data.data.newGasPrice);

                await BatchMintUpload.findOneAndUpdate(
                    { "transactionHashes.hash": hash },
                    {
                        $set: {
                            "transactionHashes.$.status": 'CONFIRMED',
                            "transactionHashes.$.hash": result.data.data.newHash,
                            "transactionHashes.$.gasConsumed": estimatedGas.mul(gasPrice).toString(),
                        }
                    }
                );
            } else if (result.data.data.newStatus === 'FAILED') {
                console.log(`FAILED - ${hash}`)
                await BatchMintUpload.findOneAndUpdate(
                    { "transactionHashes.hash": hash },
                    {
                        $set: {
                            "transactionHashes.$.status": 'FAILED',
                            "transactionHashes.$.hash": result.data.data.newHash,
                        }
                    }
                );
            } else {
                console.log(`${result.data.data.newStatus} - ${hash}`);
            }
        }).catch((e) => console.log(e));
    } catch (e) {
        console.log(e);
    }
}

const pollBiconomyAndUpdateWhitelist = async(hash) => {
    biconomyTxCheck(hash).then(async(result) => {
        if(result.data.data.newStatus === 'CONFIRMED') {
            console.log(`CONFIRMED - ${hash}`);
            await Claim.findOneAndUpdate({"transactionHashes.hash": hash}, {
                $set: {
                    "transactionHashes.$.status": 'CONFIRMED',
                    "transactionHashes.$.hash": result.data.data.newHash,
                }
            })
        } else if(result.data.data.newStatus === 'FAILED') {
            await Claim.findOneAndUpdate({"transactionHashes.hash": hash}, {
                $set: {
                    "transactionHashes.$.status": 'FAILED',
                    "transactionHashes.$.hash": result.data.data.newHash,
                }
            })
        }
    }).catch(e => console.log(e));
}

const pollBiconomyAndUpdateCollectionMint = async(hash) => {
    biconomyTxCheck(hash).then(async(result) => {
        if(result.data.data.newStatus === 'CONFIRMED') {
            console.log(`Tx confirmed - ${hash}`);
            await Collection.findOneAndUpdate({transactionHash: hash}, {
                status: "CONFIRMED",
                transactionHash: result.data.data.newHash
            });
        } else if(result.data.data.newStatus === 'FAILED') {
            await Collection.findOneAndUpdate({transactionHash: hash}, {
                status: "FAILED",
                transactionHash: result.data.data.newHash
            });
        }
    });
}

/**
 * @param {string=} contractAddress - Contract Address of the NFT Collection
 * @param {string=} batchNo - BatchNo to retry
 * @param {string=} filesCount - Total No. of Files in the Batch
 * @param {string=} wallet - Wallet Address
 * @param {string=} tokenUri - Token Metadata Uri
 * @param {string=} sessionID - Session ID
 */
const retryBatchMint = async (contractAddress, batchNo, from, to, filesCount, wallet, tokenUri, sessionID) => {
    try {
        await sleep(500);
        await createCollection.methods.mintUnderCollection(
            contractAddress,
            sessionID,
            wallet, 
            from, 
            to, 
            tokenUri
        ).send({ from: process.env.MINTER, batchId: batchId++ })
            .on('transactionHash', (hash) => handleTransactionHash({ hash, localCount: -1, batchNo, from: from, to: to, wallet, sessionID }))
            .on('receipt', (receipt) => handleTransactionSuccess({ receipt, localCount: -1, batchNo, wallet, sessionID }))
            .on('error', (error) => handleTransactionError({ error, localCount: -1, batchNo, from: from, to: to, wallet, sessionID }))
    } catch (e) {
        console.log(e);
    }
}

//Agenda/cron job to update the transactions in pending state
const initAgenda = async () => {
    const agenda = await new Agenda({ db: { address: process.env.MONGODB } });
    await new Agenda({ db: { address: process.env.MONGODB }});
    await agenda.start();
    await agenda.purge();
    agenda.define('update pending txns', async () => {
        await definition();
    });
    await agenda.every('3 minutes', 'update pending txns');

    agenda.defaultLockLifetime(10000);

    const definition = async () => {
        try {
            const pendingSingleMintTxns = await Mint.find({ status: 'PENDING' });
            console.log('Checking for pending transactions.....!');
            console.log('No.of SingleMint Pending txns found', pendingSingleMintTxns?.length);

            for (let singleMint of pendingSingleMintTxns) {
                await pollBiconomyAndUpdateSingleMint(singleMint.transactionHash);
            }

            const pendingBatchMintTxns = await BatchMintUpload.find({ "transactionHashes.status": 'PENDING' });
            const pendingTxCount = countTransactions(pendingBatchMintTxns, 'PENDING');
            console.log('No.of BatchMint Pending txns found', pendingTxCount);
        
            for (let pendingBatch of pendingBatchMintTxns) {
                for (let hash of pendingBatch.transactionHashes) {
                    if(hash.status === 'PENDING')
                        await pollBiconomyAndUpdateBatchMint(
                            hash.hash,
                            pendingBatch.wallet,
                            pendingBatch.sessionID
                        );
                }
            }

            const failedBatchMintTxns = await BatchMintUpload.find({ "transactionHashes.status": {$in : ['FAILED', 'NULL'] } });
            const failedTxCount = countTransactions(failedBatchMintTxns, 'FAILED');
            const nullTxCount = countTransactions(failedBatchMintTxns, 'NULL');
            console.log('No.of BatchMint Failed txns found', failedTxCount + nullTxCount);

            for (let failedBatch of failedBatchMintTxns) {
                console.log(`Retrying for sessionID: ${failedBatch.sessionID}`);

                for (let hash of failedBatch.transactionHashes) {
                    if(hash.status === 'FAILED' || hash.status === 'NULL')
                        await retryBatchMint(
                            failedBatch.contractAddress,
                            hash.batchNo,
                            hash.from,
                            hash.to,
                            failedBatch.filesCount, 
                            failedBatch.wallet, 
                            JSON.parse(failedBatch.hash).metadataHash, 
                            failedBatch.sessionID
                        );
                }
            }

            const nullRefundDB = await BatchMintUpload.find({ 
                "status.mint": {$in : ["PENDING", "CONFIRMED"]},
                "status.refund": {$in : ["NULL", "FAILED"]}
            });
            let toRefund = [];
            nullRefundDB.forEach(_ => {
                const allConfirmed = _.transactionHashes.reduce(
                    (prevResult, hash) => prevResult && (hash.status === 'CONFIRMED'), 
                    true
                );

                if(allConfirmed && _.transactionHashes?.length)
                    toRefund.push(_);
            })

            console.log('No.of BatchMint Sessions to Refund', toRefund?.length);
            for (let _ of toRefund) {
                try {
                    let totalGasUsed = _.transactionHashes.reduce(
                        (prevRes, hash) => {
                            const gasConsumed = new BN(hash.gasConsumed);
                            return gasConsumed.add(prevRes)
                        }
                    , new BN(0));

                    let refundAmount = "0";
                    const depositedBalanceString = await minterWallet.methods.balanceOf(_.wallet, _.sessionID).call();
                    const depositedBalance = new BN(depositedBalanceString);
                    const estimatedGas = new BN(_.estimatedGas);
                    if (totalGasUsed.gte(estimatedGas)) 
                        totalGasUsed = estimatedGas
                    else
                        refundAmount = depositedBalance.sub(totalGasUsed).toString();
    
                    await refundGas(
                        _.wallet, 
                        refundAmount.toString(), 
                        totalGasUsed.toString(), 
                        _.estimatedGas, 
                        _.sessionID
                    );
                } catch (e) {
                    console.log(e);
                }
            }

            const pendingRefundDB = await BatchMintUpload.find({ "status.refund": 'PENDING' });
            const pendingRefundCount = countTransactions(pendingRefundDB, 'PENDING');
            console.log('No.of Refund Pending txns found', pendingRefundCount);
            for (let pendingRefund of pendingRefundDB)
                await pollBiconomyAndUpdateRefundStatus(pendingRefund.refundHash);


            //Whitelist handling
            const pendingWhitelistTxns = await Claim.find({ "transactionHashes.status": 'PENDING' });
            const pendingWhitelistTxCount = countTransactions(pendingWhitelistTxns, 'PENDING');
            console.log('No.of whitelist Pending txns found', pendingWhitelistTxCount);

            for (let pendingBatch of pendingWhitelistTxns) {
                for (let hash of pendingBatch.transactionHashes) {
                    if(hash.status === 'PENDING')
                        await pollBiconomyAndUpdateWhitelist(
                            hash.hash
                        );
                }
            }


            const failedWhitelistTxns = await Claim.find({ "transactionHashes.status": {$in : ['FAILED', 'NULL'] } });
            const failedWhitelistTxCount = countTransactions(failedWhitelistTxns, 'FAILED');
            const nullWhitelistTxCount = countTransactions(failedWhitelistTxns, 'NULL');
            console.log('No.of Whitelist Failed txns found', failedWhitelistTxCount + nullWhitelistTxCount);

            for (let failedBatch of failedWhitelistTxns) {
                console.log(`Retrying for whitelist sessionID: ${failedBatch.sessionID}`);

                for (let hash of failedBatch.transactionHashes) {
                    if(hash.status === 'FAILED' || hash.status === 'NULL')
                        await retryWhitelistTxn(
                            failedBatch,
                            hash
                        );
                }
            }

            //Check for whitelisting process and make the session active.
            const pendingWhitelistSession = await Claim.find({status: "PENDING"});
            if(pendingWhitelistSession.length > 0) {
                console.log(pendingWhitelistSession);
                for(let i = 0; i < pendingWhitelistSession.length; i++) {
                    let session = pendingWhitelistSession[i];
                    const txArray = session.transactionHashes;
                    const txLength = txArray.length;
                    let completedTxCount = 0;
                    for(let i=0; i<txLength; i++) {
                        if(txArray[i].status === "CONFIRMED") {
                            completedTxCount += 1;
                        }
                    }

                    if(completedTxCount === txLength) {
                        await Claim.findOneAndUpdate({sessionID: session.sessionID}, {status: "COMPLETED"});
                    }
                }
            }

            //------------------------------------- Collection ---------------------------------------//
            //----------------------------------------------------------------------------------------//
            const pendingCollectionMints = await Collection.find({status: "PENDING", transactionHash: {$nin: ["0x"]}});
            console.log('No.of Pending Collection mint transaction...', pendingCollectionMints.length);
            if(pendingCollectionMints.length > 0) {
                for (let mints of pendingCollectionMints) {
                    if(mints.status === 'PENDING') {
                        await pollBiconomyAndUpdateCollectionMint(
                            mints.transactionHash
                        );
                    }
                }
            }

            const failedCollectionMints = await Collection.find({status: "FAILED"});
            console.log("No.of Failed Collection mint transaction", failedCollectionMints.length);
            if(failedCollectionMints.length > 0) {
                for(let mints of failedCollectionMints) {
                    if(mints.status === 'FAILED') {
                        await retryCollectionMint(mints._id);
                    }
                }
            }

        } catch (e) {
            console.log(e);
        }
    }
}

module.exports = { initAgenda }

