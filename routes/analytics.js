const express = require("express");
const Mint = require("../models/mint");
const router = express.Router();
const RateLimit = require('../middleware/RateLimiter');
const User = require("../models/user");
const BatchMintUpload = require("../models/batchMint");
const Phygital = require("../models/utilities/phygital");
const CustomCollection = require('../models/collection');

const analytics = (redis) => {


    router.get("/analytics", 
        (req, res, next) => RateLimit(redis, req, res, next),
        async(req, res) => {
        try {
            const pass = req.headers["x-pass"];
            const { from, to } = req.query;
            let fromDate;
            let toDate;
            if(parseInt(from) === 0 || parseInt(to) === 0) {
                fromDate = new Date("2022-04-01");
                toDate = new Date(Date.now());
            } else {
                fromDate = new Date(parseInt(from) * 1000);
                toDate = new Date(parseInt(to) * 1000);
            }

            
            if(!pass) {
                return res.status(400).json({status: false, message: "Unauthorized!"})
            }

            if(pass !== process.env.DASHBOARD_PASSWORD) {
                return res.status(400).json({status: false, message: "Unauthorized!"})
            }
            const Mints = await Mint.find({ createdAt: { $gte: fromDate, $lt: toDate }});

            const totalERC721 = Mints.filter((item, i) => item.type === "ERC721");
            const totalSoulBound = totalERC721.filter((item, i) => item.tokenCategory ===  "soulbound");
            const totalERC1155 = Mints.filter((item, i) => item.type === "ERC1155");

            const mintDataByDay = await Mint.aggregate([
                {
                    $match: {
                        createdAt: { $gte: fromDate, $lt: toDate }
                    }
                },
                {
                    $group : {
                        _id: {
                            $dateToString: { format: "%d-%m-%Y", date: "$createdAt"}
                        },
                        count: { $sum: 1 },
                    },
                },
                {
                    $project: {
                       date: { $dateFromString: {dateString: "$_id"} },
                       count: 1
                    }
                },
                {
                    $sort: { date : 1 }
                },
                {
                    $project: { 
                        _id: 0, 
                        count: 1, 
                        date: {$dateToString: {format: "%d-%m-%Y", date: "$date"}} ,
                    } 
                }
            ]);

            const addressWithMostTxCount = await Mint.aggregate([
                {
                    $match: {
                        createdAt: { $gte: fromDate, $lt: toDate }
                    }
                },
                {
                    $group: {
                        _id: { address: "$wallet" },
                        count: { $sum: 1}
                    },
                },
                {
                    $sort: {count : -1 } 
                },
                {
                    $limit: 3
                },
                {
                    $project: { 
                        _id: 0, 
                        count: 1, 
                        address: "$_id.address"
                    } 
                }
            ]);

            const addressWithMostERC721Txns = await Mint.aggregate([
                {
                    $match: { type: "ERC721", tokenCategory: null,  createdAt: { $gte: fromDate, $lt: toDate }}
                },
                {
                    $group: {
                        _id: { type: "$type", address: "$wallet" },
                        count: { $sum: 1}
                    }
                },
                {
                    $sort: {count : -1 } 
                },
                {
                    $limit: 3
                },
                {
                    $project: { 
                        _id: 0, 
                        count: 1,
                        type: "$_id.type",
                        address: "$_id.address"
                    } 
                }
            ]);

            const addressWithMostSouldboundTxns = await Mint.aggregate([
                {
                    $match: { type: "ERC721", tokenCategory: "soulbound",  createdAt: { $gte: fromDate, $lt: toDate }}
                },
                {
                    $group: {
                        _id: { type: "$type", address: "$wallet" },
                        count: { $sum: 1}
                    }
                },
                {
                    $sort: {count : -1 } 
                },
                {
                    $limit: 3
                },
                {
                    $project: { 
                        _id: 0, 
                        count: 1,
                        type: "$_id.type",
                        address: "$_id.address"
                    } 
                }
            ]);


            const addressWithMostERC1155Txns = await Mint.aggregate([
                {
                    $match: { type: "ERC1155",  createdAt: { $gte: fromDate, $lt: toDate }}
                },
                {
                    $group: {
                        _id: { type: "$type", address: "$wallet" },
                        count: { $sum: 1}
                    }
                },
                {
                    $sort: {count : -1 } 
                },
                {
                    $limit: 3
                },
                {
                    $project: { 
                        _id: 0, 
                        count: 1,
                        type: "$_id.type",
                        address: "$_id.address"
                    } 
                }
            ]);


            
            const batchMintData = await getBatchMintData(fromDate, toDate);
            const dehiddenData = await getDehiddenData(fromDate, toDate);
            const usersData = await getUsersData(fromDate, toDate);

            const singleMintData = {
                totalMints: Mints.length,
                totalERC721: totalERC721.length - totalSoulBound.length,
                totalSoundBound: totalSoulBound.length,
                totalERC1155: totalERC1155.length,
                mintDataByDay,
                addressWithMostTxCount,
                addressWithMostERC721Txns,
                addressWithMostERC1155Txns,
                addressWithMostSouldboundTxns
            }            

            res.status(200).json({status: true, singleMintData, batchMintData, dehiddenData, usersData});
        } catch(e) {
            console.log(e);
            res.status(500).json({status: false, message:e})
        }
    });


    router.get('/custom-data', async(req, res) => {
        try {
            console.log('in custom data');
            const userWithApi = await User.find({$or : [{twitter: { $ne: null}},  {discord: {$ne: null}}]}, {wallet:1, twitter: 1, discord: 1,_id:0}).lean();

            // let userArray = [];
            // for(let i = 0; i < userWithApi.length; i++) {
            //     userArray.push(userWithApi[i].wallet);
            // }

            // // const addressesTxns = await Mint.find({wallet: {$in: userArray}});
            

            // let addressesTxns = await Mint.aggregate([
            //     {
            //         $match: {
            //             wallet: { $in: userArray}
            //         }
            //     }, {
            //         $group: {
            //             _id: { address: "$wallet"},
            //             count: { $sum: 1 }
            //         }
            //     }, {
            //         $sort: { count: - 1}
            //     }, {
            //         $project: {
            //             _id: 0,
            //             count: 1,
            //             address: "$_id.address"
            //         }
            //     }
            // ]);

            // let resultData = [];
            // for(let i = 0; i < addressesTxns.length; i++) {
            //     let data = userWithApi.find((data) => data.wallet ===  addressesTxns[i].address);
            //     data['count'] = addressesTxns[i].count;
            //     resultData.push(data);
            // }

            // console.log(resultData);



            return res.status(200).json({data: userWithApi});

        } catch(e) {
            console.log(e);
            return res.status(500).json({error: e});
        }
    });


    router.get('/api-analytics', 
        // (req, res, next) => RateLimit(redis, req, res, next),
        async(req, res) => {
            try {
                const pass = req.headers["x-pass"];
                const { from, to } = req.query;
                let fromDate;
                let toDate;
                if(parseInt(from) === 0 || parseInt(to) === 0) {
                    fromDate = new Date("2022-04-01");
                    toDate = new Date(Date.now());
                } else {
                    fromDate = new Date(parseInt(from) * 1000);
                    toDate = new Date(parseInt(to) * 1000);
                }

                if(!pass) {
                    return res.status(400).json({status: false, message: "Unauthorized!"})
                }
    
                if(pass !== process.env.DASHBOARD_PASSWORD) {
                    return res.status(400).json({status: false, message: "Unauthorized!"})
                }

                const topAddressWithV2Mints721 = await CustomCollection.aggregate([
                    {
                        $match: {type: 'ERC721', createdAt: { $gte: fromDate, $lt: toDate }}
                    },
                    {
                        $lookup: {
                            from: 'users',
                            localField: 'wallet',
                            foreignField: 'wallet',
                            as: 'users'
                        }
                    },
                    {
                        $group: {
                            _id: { type: "$type", address: "$wallet" },
                            contractAddress: { $addToSet: "$contractAddress" },
                            twitter: { $first: "$users.twitter"},
                            discord: { $first: "$users.discord"},
                            discordUnique: { $first: "$users.discordUnique"},
                            count: { $sum: 1}
                        },
                    },
                    {
                        $sort: {count : -1 } 
                    },
                    {
                        $limit: 3
                    },
                    {
                        $project: { 
                            _id: 0, 
                            count: 1,
                            type: "$_id.type",
                            address: "$_id.address",
                            contractAddress: 1,
                            twitter: 1,
                            discord: 1,
                            discordUnique: 1
                        } 
                    }
    
                ]);

                const topAddressWithV2Mints1155 = await CustomCollection.aggregate([
                    {
                        $match: {type: 'ERC1155', createdAt: { $gte: fromDate, $lt: toDate }}
                    },
                    {
                        $lookup: {
                            from: 'users',
                            localField: 'wallet',
                            foreignField: 'wallet',
                            as: 'users'
                        }
                    },
                    {
                        $group: {
                            _id: { type: "$type", address: "$wallet" },
                            contractAddress: { $addToSet: "$contractAddress" },
                            twitter: { $first: "$users.twitter"},
                            discord: { $first: "$users.discord"},
                            discordUnique: { $first: "$users.discordUnique"},
                            count: { $sum: 1}
                        },
                    },
                    {
                        $sort: {count : -1 } 
                    },
                    {
                        $limit: 3
                    },
                    {
                        $project: { 
                            _id: 0, 
                            count: 1,
                            type: "$_id.type",
                            address: "$_id.address",
                            contractAddress: 1,
                            twitter: 1,
                            discord: 1,
                            discordUnique: 1
                            
                        }
                    }
    
                ]);


                return res.status(200).json({data: {ERC721: topAddressWithV2Mints721, ERC1155: topAddressWithV2Mints1155}})
            } catch(e) {
                console.log(e);
                return res.status(500).json({error: e});
            }
    });

    return router;

}

const getBatchMintData = async(fromDate, toDate) => {
    try {
        const noOfBatchMintSessions = await BatchMintUpload.find({ createdAt: { $gte: fromDate, $lt: toDate }});

        const totalNFTsMinted = await BatchMintUpload.aggregate([
            {
                $match: {
                    createdAt: { $gte: fromDate, $lt: toDate }
                }
            },
            {
                $group: {
                    _id: null,
                    count: { $sum: "$filesCount"}
                }
            },
            {
                $project: {
                    _id: 0,
                    count: 1
                }
            }
        ]);

        console.log(totalNFTsMinted);



        return {
            totalSession: noOfBatchMintSessions.length,
            totalNFTsMinted: totalNFTsMinted.length > 0 ? totalNFTsMinted[0].count : 0
        }
    } catch(e) {
        console.log(e);
    }
}

const getDehiddenData = async(fromDate, toDate) => {
    try {
        const noOfAutographedNFTs = await Mint.find({autograph: true,  createdAt: { $gte: fromDate, $lt: toDate }});
        const noOfPhygitalOrders = await Mint.find({phygital: true,  createdAt: { $gte: fromDate, $lt: toDate }});

        return {
            noOfAutographedNFTs: noOfAutographedNFTs.length,
            noOfPhygitalOrders: noOfPhygitalOrders.length
        }
    } catch(e) {
        console.log(e);
    }
    
}

const getUsersData = async(fromDate, toDate) => {
    try {
        const Users = await User.find({ createdAt: { $gte: fromDate, $lt: toDate }});
        const usersWithApiKey = Users.filter(item => item.socialApi.length > 0);


        return {
            noOfUsers: Users.length,
            usersWithApiKey: usersWithApiKey.length
        }
    } catch(e) {
        console.log(e)
    }
}

module.exports = analytics;