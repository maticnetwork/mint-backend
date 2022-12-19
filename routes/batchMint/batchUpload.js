const express = require('express');
const router = express.Router();
const path = require("path");
const fs = require("fs");
const { v4: uuid } = require('uuid');
const multer = require('multer');
const { check, validationResult } = require('express-validator');
const { NFTStorage, File } = require('nft.storage');
const extract = require('extract-zip');
const { parse } = require('csv-parse/sync');
const { getFilesFromPath, filesFromPath } = require('files-from-path')

const BatchMintUpload = require('../../models/batchMint');
const AuthCheck = require('../../middleware/API');
const ApiError = require('../../utils/ApiError');
const { web3 } = require('./../../config/Biconomy');
const { sync } = require('../../config/Aws');
const { BatchSize } = require('../../global');
const { estimateGas } = require('./../utilities/handleBatchMint');
const { JWTAuth } = require("../../middleware/JWTValidation");

const RateLimit = require('../../middleware/RateLimiter');
const BN = web3.utils.BN;
const NFT_STORAGE_KEY = process.env.NFT_STORAGE_KEY
const dir = path.join(__dirname, "./../../uploads/batchmint");

if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const sessionID =  req.sessionID;
        const rootPath = path.join(__dirname, "./../../uploads/batchmint/" + sessionID + '/rawdata');
        const assetDirPath = path.join(__dirname, "./../../uploads/batchmint/" + sessionID + '/assets');
        const previewDirPath = path.join(__dirname, "./../../uploads/batchmint/" + sessionID + '/preview');
        if(file.fieldname === 'assets') {
            if (!fs.existsSync(assetDirPath)) {
                fs.mkdirSync(assetDirPath, { recursive: true });
            }
            cb(null, `uploads/batchmint/${sessionID}/assets`);
        } else if(file.fieldname === 'preview') {
            if (!fs.existsSync(previewDirPath)) {
                fs.mkdirSync(previewDirPath, { recursive: true });
            }
            cb(null, `uploads/batchmint/${sessionID}/preview`);
        } else if(file.fieldname === 'csv') {
            if (!fs.existsSync(rootPath)) {
                fs.mkdirSync(rootPath, { recursive: true });
            }
            cb(null, `uploads/batchmint/${sessionID}/rawdata`);
        }
    },
    filename: function (req, file, cb) {
        if(file.mimetype === 'text/csv') {
            console.log(file.mimetype);
            cb(
                null,
                'metadata.csv'
            );
        } else if(file.mimetype === 'application/json') {
            cb(
                null,
                'metadata.json'
            );
        } else {
            cb(
                null,
               file.originalname
            );   
        }
        
    },
});

const upload = multer({ storage: storage, limits: { fileSize: '500mb'} });

async function Upload(dir) {
    try {
        const nftstorage = new NFTStorage({ token: NFT_STORAGE_KEY });
        const files = await getFilesFromPath(dir);
        const cid = await nftstorage.storeDirectory(files);
        console.log({ cid })
        const status = await nftstorage.status(cid)
        console.log({ status })
        return cid
    } catch (error) {
        console.log(error);
    }
}

async function extractZip(source, target) {
    try {
        await extract(source, { dir: target });
        console.log(target, "Extraction complete");
    } catch (err) {
        console.log("Oops: extractZip failed", err);
    }
}

async function getFileFormat(dir) {
    const files = await getFilesFromPath(dir);
    let fileFormat = []
    for (let i = 0; i < files.length; i++) {
        fileFormat.push(files[i].name.split(".").pop())
    }
    return fileFormat
}

const getFilesFromPathInOrder = async (dir) => {
    let files = await getFilesFromPath(dir);
    files.sort((a, b) => {
        const name_a = a.name.split('/').pop();
        const name_b = b.name.split('/').pop();
        return (+name_a.split('.')[0]) - (+name_b.split('.')[0])
    })

    return files;
}

const checkNamingConvention = (fileFromPath) => {
    let fileIterator = 0;
    fileFromPath.map(fileObj => {
        const name = fileObj.name.split('/').pop();
        if (name.split('.')[0] !== '' + fileIterator)
            throw new ApiError(400, 'Naming Not Proper');

        fileIterator++;
    })
}

const uploadToS3 = async (dirPath, s3DirKey) => {
    return sync(dirPath, `s3://${process.env.S3_MEDIA_BUCKET}/${s3DirKey}`);
}

const uploadFlow = async (dirPath, sessionID) => {
    console.log(`Uploading assets to S3 for sessionID: ${sessionID}`);

    const previewExists = fs.existsSync(dirPath + "/preview");
   
    uploadToS3(dirPath + "/assets", sessionID + "/assets").then(() => {
        console.log(`Successully uploaded assets to S3 for sessionID: ${sessionID}`);
        return uploadToS3(dirPath + "/rawdata", sessionID + "/rawdata")
    }).then(()=>{
        console.log(`Successully uploaded raw metadata to S3 for sessionID: ${sessionID}`);
        if (previewExists) {
            console.log(`Uploading preview to S3 for sessionID: ${sessionID}`)
            return uploadToS3(dirPath + "/preview", sessionID + "/preview")
        }

        return undefined;
    }).then(() => {
        if (previewExists) {
            console.log(`Successully uploaded previews to S3 for sessionID: ${sessionID}`);
        }

        BatchMintUpload.findOneAndUpdate(
            { sessionID: sessionID }, 
            { $set: { "status.s3": 'CONFIRMED' }}, 
            (err, res) => {
                if (err) 
                    throw new ApiError(400, "Database Update Error")

                if (previewExists) {
                    fs.rmSync(dirPath + "/preview/", { recursive: true, force: true });
                    fs.rmSync(dirPath + "/preview.zip", { force: true });
                }
                
                fs.rmSync(dirPath + "/assets/", { recursive: true, force: true });
                fs.rmSync(dirPath + "/assets.zip", { force: true });
            }
        );
    }).catch(error => {
        console.log('Upload to S3 Error -', error)
        BatchMintUpload.findOneAndUpdate(
            { sessionID: sessionID }, 
            { $set: { "status.s3": 'FAILED' }}, 
            (err, res) => {
                if (err) 
                    throw new ApiError(400, "Database Update Error")

                if (previewExists)
                    fs.rmSync(dirPath + "/preview.zip", { force: true });
                
                fs.rmSync(dirPath + "/assets.zip", { force: true });
            }
        );
    });
}

const setSessionId = (req, res, next) => {
    req.sessionID = uuid();
    console.log("Session ID: ", req.sessionID);
    next();
}

const uploadBatchAPI = (redisClient) => {

/* @route   POST /api/batch/uploadAssets
    @desc    Uploads assets 
    @access  API Key
    @body  wallet {string} - wallet address
            assets {file} - assets files
            preview {file} - preview files
            metadata {file} - metadata json file
    @return  sessionID {string} - session id
*/

router.post("/batch/uploadAssets",setSessionId,JWTAuth, AuthCheck,
(req, res, next) => RateLimit(redisClient, req, res, next),
upload.any(),
    async (req, res) => {
        res.setTimeout(0);
        const sessionID = req.sessionID;
        let dirPath;
        try {

            if (!req.body.wallet)
                throw new ApiError(400, 'Wallet Id required');

            if (!req.body.sessionName)
                throw new ApiError(400, 'Session Name required')

            const checkSessionID = await BatchMintUpload.findOne({ sessionID: sessionID });
            if (checkSessionID) throw new ApiError(400, 'Session ID already exists');
    
            dirPath = path.join(__dirname, "./../../uploads/batchmint/" + sessionID);

            let metadata = [];
            let metadataExtension;
            const rawdata = await fs.promises.readdir(dirPath + "/rawdata/");
            if(rawdata) {
                const index = rawdata.findIndex(file => file.includes('.'));
                metadataExtension = rawdata[index].split('.').pop();
            }
            console.log(metadataExtension);
            if (metadataExtension === 'csv') {
                const metadataCSV = fs.readFileSync(dirPath + "/rawdata/" + "metadata.csv", { encoding: 'utf-8' });
                metadata = parse(metadataCSV, { columns: true });
                
                if (!metadataCSV.split('\n')[0].includes('index,name,description'))
                    throw new ApiError(400, 'Metadata is not in proper format')

                let metadataRes = [];
                for(let _ of metadata) {
                    let obj = {};
                    let { index, name, description, ...attributesObj} = _;
                    obj.index = index.trim();
                    obj.name = name.trim();
                    obj.description = description.trim();

                    if (!(obj.index && obj.name && obj.description))
                        throw new ApiError(400, 'Metadata is incomplete')

                    obj.attributes = Object.keys(attributesObj).map(atributeKey => ({
                        "trait_type": atributeKey, 
                        "value": attributesObj[atributeKey]
                    }))

                    metadataRes.push(obj)
                }

                metadata = metadataRes;
                fs.writeFileSync(
                    dirPath + "/rawdata/" + "metadata.json",
                    JSON.stringify(metadata, null, 2),
                );
            } else if (metadataExtension === 'json') {
                console.log('It is json');
                metadata = JSON.parse(fs.readFileSync(dirPath + "/rawdata/" + "metadata.json", { encoding: 'utf-8' }));

                for(let _ of metadata) {
                    let { index, name, description} = _;
                    if(!((index+'') && name && description))
                        throw new ApiError(400, 'Metadata is not in proper format')
                }
            } else {
                throw new ApiError(400, 'Unknown metadata extension');
            }

            //await extractZip(dirPath + "/assets.zip", dirPath + "/assets");
            const assetsFormat = await getFileFormat(dirPath + "/assets");
            const assetFiles = await getFilesFromPathInOrder(dirPath + "/assets");

            if (assetFiles.length !== metadata.length)
                throw new ApiError(400, 'Files or Metadata is incomplete');

            if (!assetsFormat.every(_ => _ === assetsFormat[0]))
                throw new ApiError(400, 'File Format is not same');

            const previewNotRequiredFormats = ['png', 'jpg', 'jpeg', 'gif']
            if (!previewNotRequiredFormats.includes(assetsFormat[0]) && !req.files.preview)
                throw new ApiError(400, `Preview required for ${assetsFormat[0]} file format`);

            checkNamingConvention(assetFiles);

            let previewFiles = [];
                previewFiles = await getFilesFromPathInOrder(dirPath + "/preview/");

                if (assetFiles.length !== previewFiles.length)
                    throw new ApiError(400, 'No. of Asset and Preview files should be the same');

                checkNamingConvention(previewFiles);
            

            let estimatedGas = new BN(await estimateGas(req.body.wallet, sessionID));
            let gasPrice = new BN(await web3.eth.getGasPrice());
            const assetLength = assetFiles.length > BatchSize ? assetFiles.length : BatchSize;
            const batches = new BN(parseInt(assetLength / BatchSize));
            estimatedGas = estimatedGas.mul(gasPrice).mul(batches).mul(new BN(2));


            await BatchMintUpload.create({
                wallet: req.body.wallet,
                sessionID: sessionID,
                name: req.body.sessionName,
                estimatedGas: estimatedGas.toString(),
                gasPrice: gasPrice.toString(),
                filesCount: assetFiles.length,
                status : {
                    s3: 'PENDING',
                    ipfs: 'NULL',
                    gas: 'NULL',
                    mint: 'NULL',
                    refund: 'NULL'
                }
            });

            uploadFlow(dirPath, sessionID);

            return res.status(200).json({
                sessionID: sessionID
            });
        } catch (err) {
            console.log(err);
            fs.rmSync(dirPath, { recursive: true, force: true });
            const statusCode = err.statusCode ? err.statusCode : 500;
            return res.status(statusCode).json({ error: err?.message });
        }
    }
)

/* @route   POST /api/batch/upload/retry
    @desc    Retry upload to S3
    @access  API Key
    @body    sessionID - {string} - Session ID
             wallet - {string} - Wallet Address
    @return  {object} - {status, message}
*/

router.post("/batch/upload/retry", AuthCheck,
    JWTAuth,(req, res, next) => RateLimit(redisClient, req, res, next),
    async (req, res) => {
        try {
            const { wallet, sessionID } = req.body;
            const check = await BatchMintUpload.findOneAndUpdate({
                wallet: wallet,
                sessionID: sessionID,
                "status.s3": 'FAILED'
            }, {
                $set: { "status.s3": 'PENDING' },
            });

            if (!check) {
                return res.status(400).json({
                    error: "Invalid wallet or sessionID"
                });
            }

            const dirPath = path.join(__dirname, "./../../uploads/batchmint/" + check.sessionID);
            uploadFlow(dirPath, sessionID);

            return res.status(200).json({
                status: 'ok',
                message: 'Retrying Upload to S3'
            });
        } catch(err) {
            console.log(err);
            const statusCode = err.statusCode ? err.statusCode : 500;
            return res.status(statusCode).json({ error: err?.message });
        }
    }
)

/* @route   POST /api/batch/ipfs
    @desc    Upload to IPFS
    @access  API Key
    @body    sessionID - {string} - Session ID
                wallet - {string} - Wallet Address
    @return  {object} - {sessionID}
*/

router.post("/batch/ipfs",JWTAuth, AuthCheck, (req, res, next) => RateLimit(redisClient, req, res, next),
    async (req, res) => {
        try {
            const { wallet, sessionID } = req.body;
            const check = await BatchMintUpload.findOneAndUpdate({
                wallet: wallet,
                sessionID: sessionID,
            }, {
                $set: { "status.ipfs": 'PENDING' },
            });

            if (!check) {
                return res.status(400).json({
                    error: "Invalid wallet or sessionID"
                });
            }

            // validate if all files are uploaded and contract is deployed
            if(check?.status?.s3 === 'NULL') {
                return res.status(400).json({
                    error: "No Files uploaded yet"
                });
            }
            if(check?.contractAddress === "0x0"){
                return res.status(400).json({
                    error: "Contract not deployed"
                });
            }

            const dirPath = path.join(__dirname, "./../../uploads/batchmint/" + check.sessionID);
            let hash = {};
            let metadataJSON = {};

            console.log(`Downloading from S3 for sessionID: ${sessionID}`)
            sync(`s3://${process.env.S3_MEDIA_BUCKET}`, dirPath, {
                relocations: [[check.sessionID, '']],
                filters: [
                    { exclude: () => true },
                    { include: (key) => key.includes(check.sessionID) },
                ],
            }).then(async() => {
                console.log(`Downloading from S3 complete for sessionID: ${sessionID}`)
                return getFileFormat(dirPath + "/assets");
            }).then(async assetsFormat => {
                console.log(`Uploading to IPFS for sessionID: ${sessionID}`)
                Upload(dirPath + "/assets").then(assetsCID => {
                    console.log(`Assets Uploaded to IPFS sessionID: ${sessionID} with CID: ${assetsCID}`)
                    const assetHash = "ipfs://" + assetsCID + "/assets";
                    hash["assetHash"] = assetHash;

                    metadataJSON = JSON.parse(fs.readFileSync(dirPath + "/rawdata/" + "metadata.json", { encoding: 'utf-8' }));
                    metadataJSON.sort((a, b) => +a.index - +b.index)
                    fs.mkdirSync(dirPath + "/metadata/", { recursive: true });

                    let file_iterator = 0;
                    let imageAttribute = ['gltf', 'glb', 'webm', 'mp4', 'm4v', 'ogv', 'ogg'].includes(assetsFormat[0]) ? 'animation_url' : 'image';
                    metadataJSON = metadataJSON.map(metadata => {
                        metadata[imageAttribute] = hash.assetHash + '/' + file_iterator + '.' + assetsFormat[file_iterator]
                        file_iterator++;
                        return metadata;
                    })

                    fs.rmSync(dirPath + "/assets/", { recursive: true, force: true });
                }).then(_ => {
                    if (fs.existsSync(dirPath + "/preview")) {
                        console.log(`Uploading previews to IPFS for sessionID: ${sessionID}`)
                        return Upload(dirPath + "/preview");
                    }

                    return undefined;
                }).then(previewCID => {
                    if (previewCID) {
                        fs.rmSync(dirPath + "/preview/", { recursive: true, force: true });
                        console.log(`Previews Uploaded to IPFS sessionID: ${sessionID} with CID: ${previewCID}`)

                        const previewHash = "ipfs://" + previewCID + "/preview";
                        hash["previewHash"] = previewHash;

                        let file_iterator = 0;
                        metadataJSON = metadataJSON.map(metadata => {
                            if(metadata["image"]) 
                                metadata["external_url"] = metadata["image"];

                            metadata["image"] = hash.previewHash + '/' + file_iterator + '.' + assetsFormat[file_iterator]
                            file_iterator++;
                            return metadata;
                        })
                    }

                    let file_iterator = 0;
                    for (let metadata of metadataJSON) {
                        fs.writeFileSync(
                            dirPath + "/metadata/" + file_iterator++ + '.json',
                            JSON.stringify(metadata, null, 2),
                        );
                    }

                    console.log(`Uploading Metadata to IPFS for sessionID: ${sessionID}`)
                    return Upload(dirPath + "/metadata");
                }).then(async metadataCID => {
                    fs.rmSync(dirPath + "/metadata/", { recursive: true, force: true });

                    console.log(`Metadata Uploaded to IPFS sessionID: ${sessionID} with CID: ${metadataCID}`)
                    const metadataHash = "ipfs://" + metadataCID + "/metadata";
                    hash["metadataHash"] = metadataHash;

                    await BatchMintUpload.findOneAndUpdate(
                        { sessionID: sessionID }, 
                        { $set: { 
                            "status.ipfs": 'CONFIRMED', 
                            hash: JSON.stringify(hash),
                        }}
                    );
                }).catch(async e => {
                    console.log('Error in IPFS Upload:', e);
                    await BatchMintUpload.findOneAndUpdate(
                        { sessionID: sessionID }, 
                        { $set: { 
                            "status.ipfs": 'FAILED', 
                            hash: JSON.stringify(hash),
                        }}
                    );
                })
            });

            return res.status(200).json({
                message: "Upload to IPFS initiated! Please hit checkStatus route for the updates!"
            });
        } catch(err) {
            console.log(err);
            const statusCode = err.statusCode ? err.statusCode : 500;
            return res.status(statusCode).json({ error: err?.message });
        }
    }
)

return router;
}
module.exports = {
    uploadBatchAPI
};
