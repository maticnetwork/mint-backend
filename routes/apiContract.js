const express = require("express");
const router = express.Router();
const AuthCheck = require("../middleware/API");
const RateLimit = require("../middleware/RateLimiter");
const JWT = require('jsonwebtoken');

const { web3, nftFactory } = require("./../config/Biconomy");
const { calculateGasPrice, getGasTankBalance } = require('./utilities/GasTank');
const { checkGasBalance } = require('../middleware/GasBalance');


const { ERC1155Factory, ERC721Factory } = nftFactory;
const User = require("../models/user");
const Collection = require("../models/collection");
const { SignatureAuth } = require("../middleware/SignatureAuth");
const { JWTAuth } = require("../middleware/JWTValidation");

const erc721Factory = new web3.eth.Contract(ERC721Factory.abi, ERC721Factory.address);
const erc1155Factory = new web3.eth.Contract(ERC1155Factory.abi, ERC1155Factory.address);

const collectionCreation = (redisClient) => {
    router.post('/collection/create', AuthCheck,
        async (req, res) => {

        try {
            const { wallet, contractId, nftType, name, symbol } = req.body;

            if(!wallet || !contractId) {
                throw new ApiError(400, "Bad Data, Wallet address missing");
            }

            const user = await User.findOne({wallet});
            if(user && user.customContracts && user.customContracts.length >= 5) {
                return res.status(400).json({message: "Reached max limit to create contract"});
            }

            let collectionAddress = '';

            if(nftType === 'ERC721') {
                collectionAddress = await erc721Factory.methods.collectionRecords(wallet, contractId).call();
            } else {
                collectionAddress = await erc1155Factory.methods.collectionRecords(wallet, contractId).call();
            }
    
            if(collectionAddress !== '0x0000000000000000000000000000000000000000') {
                const isUpdated = await User.findOne({wallet, customContracts: {$elemMatch: {collectionAddress}}});
                if(isUpdated) {
                    return res.status(200).json({isCreated: true, message: "Already updated!"});
                }
                await User.findOneAndUpdate({ wallet }, { $push: {customContracts: {contractId, collectionAddress, nftType, name, symbol} }});
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

    router.get('/collection/canCreate/:wallet', AuthCheck, async(req, res) => {
        try {
            const { wallet } = req.params;
            const user = await User.findOne({wallet});
           
            if(user && user.customContracts && user.customContracts.length >= 5) {
                return res.status(200).json({status: false, message: "Reached max contract limit"});
            } else {
                return res.status(200).json({status: true, message: "Good to proceed"});
            }
        } catch(e) {
            console.log(e);
            return res.status(500).json({message: e})
        }
    });

    router.post('/collection/async/mint', AuthCheck, JWTAuth,
        (req, res, next) => RateLimit(redisClient, req, res, next),
        async(req, res) => {
        try {
            const { wallet, contractAddress, to, tokenUri, supply } = req.body;

            if(!wallet || !contractAddress || !to || !tokenUri) {
                return res.status(400).json({status: 400, message: "Bad data"});
            }

            const user = await User.findOne({wallet,  customContracts: {$elemMatch: {collectionAddress: contractAddress}}});

            if(!user) {
                return res.json({status: 400, message: "Details not found!"});
            }

            const collection = user.customContracts.filter((item) => item.collectionAddress === contractAddress)[0];

            let defaultSupply = 1;
            if(supply !== undefined) {
                defaultSupply = supply;
            }  

            const isAvailable = await checkGasBalance(req);
            if(!isAvailable) {
                return res.status(400).json({message: "Insufficient gas tank balance to send transaction, please fill the gas tank!"});
            }

            const data = {
                wallet: wallet,
                tokenURI: tokenUri,
                type: collection.nftType,
                contractAddress: collection.collectionAddress,
                transactionHash: "0x",
                status: "PENDING",
                supply: defaultSupply,
                contractId: collection.contractId,
                to: to
            };

            const collectionMint = await new Collection(data);
            const savedData = await collectionMint.save();
            const txId = savedData._id;


            if(collection.nftType === 'ERC721') {
                erc721Factory.methods.mintUnderCollection(collection.collectionAddress, collection.contractId, to, tokenUri).send({from: process.env.MINTER})
                    .on("transactionHash", (hash) => handleTxHash(txId, hash))
                    .on('receipt', (receipt) => handleSuccess(txId, receipt, collection.nftType, wallet))
                    .on('error', (err) => handleTxError(txId, err));
            } else if(collection.nftType === 'ERC1155') {
                erc1155Factory.methods.mintUnderCollection(collection.collectionAddress, collection.contractId, to, tokenUri, supply).send({from: process.env.MINTER})
                    .on("transactionHash", (hash) => handleTxHash(txId, hash))
                    .on("receipt", (receipt) => handleSuccess(txId, receipt, collection.nftType, wallet))
                    .on('error', (err) => handleTxError(txId, err));
            }

            return res.json({status: true, message: "Mint in progress!"});

        } catch(e) {
            console.log(e);
            return res.status(500).json({status: false, message: "Internal server error!"});
        }
    });

    router.post('/collection/mint', AuthCheck, JWTAuth,
        (req, res, next) => RateLimit(redisClient, req, res, next),
        async(req, res) => {
        try {
            const { wallet, contractAddress, to, tokenUri, supply } = req.body;

            if(!wallet || !contractAddress || !to || !tokenUri) {
                return res.status(400).json({status: 400, message: "Bad data"});
            }

            const user = await User.findOne({wallet,  customContracts: {$elemMatch: {collectionAddress: contractAddress}}});

            if(!user) {
                return res.json({status: 400, message: "Details not found!"});
            }

            const collection = user.customContracts.filter((item) => item.collectionAddress === contractAddress)[0];

            let defaultSupply = 1;
            if(supply !== undefined) {
                defaultSupply = supply;
            }  

            const isAvailable = await checkGasBalance(req);
            if(!isAvailable) {
                return res.status(400).json({message: "Insufficient gas tank balance to send transaction, please fill the gas tank!"});
            }

            const data = {
                wallet: wallet,
                tokenURI: tokenUri,
                type: collection.nftType,
                contractAddress: collection.collectionAddress,
                transactionHash: "0x",
                status: "PENDING",
                supply: defaultSupply,
                contractId: collection.contractId,
                to: to
            };

            const collectionMint = await new Collection(data);
            const savedData = await collectionMint.save();
            const txId = savedData._id;
            let response = [];

            if(collection.nftType === 'ERC721') {
                response = await Promise.race([
                erc721Factory.methods.mintUnderCollection(collection.collectionAddress, collection.contractId, to, tokenUri).send({from: process.env.MINTER})
                    .on("transactionHash", (hash) => handleTxHash(txId, hash))
                    .on('receipt', (receipt) => handleSuccess(txId, receipt, collection.nftType, wallet))
                    .on('error', (err) => handleTxError(txId, err)),

                    new Promise((res, rej) =>
                    setTimeout(
                      () => res({ timeOut: true }),
                      30000
                    )
                  )
                ]);
            } else if(collection.nftType === 'ERC1155') {
                response = await Promise.race([
                erc1155Factory.methods.mintUnderCollection(collection.collectionAddress, collection.contractId, to, tokenUri, supply).send({from: process.env.MINTER})
                    .on("transactionHash", (hash) => handleTxHash(txId, hash))
                    .on("receipt", (receipt) => handleSuccess(txId, receipt, collection.nftType, wallet))
                    .on('error', (err) => handleTxError(txId, err)),
                    
                    new Promise((res, rej) =>  setTimeout(
                        () => res({ timeOut: true }),
                        30000
                      )
                    )
                ]);
            }

            if(!response.timeOut) {
                return res.json({status: true, message: "Mint success", data: response});
            } else {
                return res.json({status: true, message: "Mint in progress!"});
            }

        } catch(e) {
            console.log(e);
            return res.status(500).json({status: false, message: e});
        }
    });


    router.get('/collection/user/:wallet', AuthCheck, async(req, res) => {
        try {
            const { wallet } = req.params;
            const user = await User.findOne({wallet});
            if(user) {
                if(user.customContracts) {
                    return res.status(200).json({status: true, message: "Collections found", data: user.customContracts, isToken: user.refreshToken ? true: false});
                } else {
                    return res.status(200).json({status: false, message: "No collections created!", isToken: user.refreshToken ? true : false})
                }
            } else {
                return res.status(400).json({status: false, message: "User not found"})
            }
        } catch(e) {
            console.log(e);
            return res.status(500).json({status: false, message: "Internal server error!"});
        }
    });

    //Optional route
    router.get('/collection/:collectionAddress', AuthCheck, JWTAuth, async(req, res) => {
        try {
            const { collectionAddress } = req.params;
            let { page } = req.query;
            if(!page) {
                page = 1;
            }
            const limit = 25;
            const skipCount = (parseInt(page) - 1) * limit;
            const collections = await Collection.aggregate([
                {
                    $match: { contractAddress: collectionAddress},
                },
                {
                    $sort: {_id: -1}
                },
                {
                    $skip: skipCount
                },
                {
                    $limit: limit
                },
                {
                   $project: {
                        _id: 0,
                        collectionAddress: "$contractAddress",
                        tokenId: "$tokenId",
                        type: "$type",
                        supply: "$supply",
                        tokenURI: "$tokenURI",
                        status: "$status",
                        owner: "$to"
                   }
                }
            ]);

            if(collections.length > 0) {
                return res.status(200).json({status: true, message: "Collection NFTs found", data: collections});
            }  else {
                return res.status(400).json({status: false, message: "No NFTs found under this collection or try sending proper page number"});
            }
        } catch(e) {
            console.log(e);
            return res.status(500).json({status: false, message: "Internal server error!"});
        }

    });
    
    router.get('/collection/all/:wallet',AuthCheck,async(req, res) => {
        try {
            const { wallet } = req.params;
            let { page } = req.query;
            if(!page) {
                page = 1;
            }
            const limit = 5;
            const skipCount = (parseInt(page) - 1) * limit;
            const totalPages = await Collection.countDocuments({wallet:wallet,to:wallet}) / limit;
            const collections = await Collection.find({wallet:wallet,to:wallet})?.sort({_id: -1})?.skip(skipCount)?.limit(limit).lean();
            if(collections.length > 0) {
                return res.status(200).json({status: true, message: "Collection NFTs found", data: collections, totalPages: Math.ceil(totalPages)});
            }  else {
                return res.status(400).json({status: false, message: "No NFTs found"});
            }
        } catch(e) {
            console.log(e);
            return res.status(500).json({status: false, message: "Internal server error!"});
        }

    });

    router.post('/refreshJWT', AuthCheck, async(req, res) => {
		try {	
			const { wallet } = req.body;
			if(!wallet) return res.status(400).json({status: false, message: "Wallet address not provided!"});

			const refreshToken = req.headers['x-refresh-token'];

			const user = await User.findOne({wallet});
			console.log(user.refreshToken);
			if(user && user.refreshToken && user.refreshToken === refreshToken) {
				const token = JWT.sign({wallet}, process.env.JWT_SECRET, {expiresIn: '12h'});
				return res.status(200).json({status: true, jwt: token});
			} else {
				return res.status(400).json({status: false, message: "Unauthorized operation!"});
			}
		} catch(e) {
			console.log(e);
			res.status(500).json({status: false, message: e});
		}
	});

    return router;
}



async function handleTxHash(txId, hash) {
    try {
        console.log('Tx hash...', hash)
        await Collection.findOneAndUpdate({_id: txId}, {transactionHash: hash});
    } catch(e) {
        console.log(e);
    }
}

async function handleSuccess(txId, receipt, type, wallet) {
    try {
        console.log('Tx success...', receipt.transactionHash);
        const returnValues = await decodeEventLog(receipt.events['0'].raw, type);
        let id;
        if(type === 'ERC721') {
            id = returnValues.value;
        } else {
            id = returnValues.id;
        }
        const feeBurnt = await calculateGasPrice(receipt);

        await Collection.findOneAndUpdate({_id: txId}, {
            status: "CONFIRMED",
            tokenId: id
        });

        const userData = await User.findOne({wallet: wallet});
        console.log(userData);
        console.log(wallet);
        let gasFeeUtilized;
        if(userData.gasFeeUtilized) {
            gasFeeUtilized = web3.utils.toBN(userData.gasFeeUtilized).add(web3.utils.toBN(feeBurnt));
        } else {
            gasFeeUtilized = web3.utils.toBN(feeBurnt)
        }

        await User.findOneAndUpdate({wallet: wallet}, {gasFeeUtilized});
    } catch(e) {
        console.log(e);
    }
}

async function handleTxError(txId, err) {
    try {
        console.log("Tx failed...", err);
        if(err === 'Error: execution reverted: Not allowed to mint under this contract!') {
            await Collection.findOneAndUpdate({_id: txId}, {
                status: "NOT CONFIMED"
            });
            return;
        } else {
            await Collection.findOneAndUpdate({_id: txId}, {
                status: "FAILED"
            });
        }
    } catch(e) {
        console.log(e);
    }
}

async function retryCollectionMint(id) {
    const txId = id;
    const data = await Collection.findOne({_id: id});
    if(data.type === 'ERC721') {
        erc721Factory.methods.mintUnderCollection(data.contractAddress, data.contractId, data.to, data.tokenURI).send({from: process.env.MINTER})
            .on("transactionHash", (hash) => handleTxHash(txId, hash))
            .on('receipt', (receipt) => handleSuccess(txId, receipt, data.type))
            .on('error', (err) => handleTxError(txId, err));
    } else if(data.type === 'ERC1155') {
        erc1155Factory.methods.mintUnderCollection(data.contractAddress, data.contractId, data.to, data.tokenURI, data.supply).send({from: process.env.MINTER})
            .on("transactionHash", (hash) => handleTxHash(txId, hash))
            .on("receipt", (receipt) => handleSuccess(txId, receipt, data.type))
            .on('error', (err) => handleTxError(txId, err));
    }
}

async function decodeEventLog(raw, type) {
    const topics = raw.topics;
    const data = raw.data;
    if(type === 'ERC721') {
        console.log(topics);
        return web3.eth.abi.decodeLog([{
            type: 'address',
            name: 'from',
            indexed: true
        }, {
            type: 'address',
            name: 'to',
            indexed: true
        },
        {
            type: 'uint256',
            name: 'value',
            indexed: true
        }],
            data,
            [topics[1], topics[2], topics[3]]
        );
    } else if(type === 'ERC1155') {
        return web3.eth.abi.decodeParameters([
            {
                type: 'uint256',
                name: 'id',
            },
            {
                type: 'uint256',
                name: 'value',
            }], raw.data)
    }
}

module.exports = {
    collectionCreation,
    retryCollectionMint
};