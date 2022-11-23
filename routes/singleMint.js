const express = require("express");
const { check, validationResult } = require("express-validator");

const Agenda = require("agenda");

const { createAlchemyWeb3 } = require("@alch/alchemy-web3");

const router = express.Router();
const formidable = require("formidable");
const axios = require("axios");

const fs = require("fs");
const Mint = require("./../models/mint");
const Image = require("./../models/image");
const { NFTStorage, File } = require("nft.storage");
const { Web3Storage } = require("web3.storage");

const ERC721SingleMintAbi = require("../abis/ERC721SingleMint.json");
const ERC1155SingleMintAbi = require("../abis/ERC1155SingleMint.json");
const catchAsync = require("./../utils/catchAsync");

const AuthCheck = require("../middleware/API");
const RateLimit = require("../middleware/RateLimiter");

const { web3, globalNFT, networkId, ALCHEMY_URL } = require("./../config/Biconomy");

const NFT_STORAGE_KEY = process.env.NFT_STORAGE_KEY;
const WEB3_STORAGE_KEY = process.env.WEB3_STORAGE_KEY;
const PROVIDER_URL_MAINNET = process.env.PROVIDER_URL_MAINNET;
const PROVIDER_TESTNET = "https" + process.env.PROVIDER_URL.substring(3, process.env.PROVIDER_URL.length);

let { batchId } = require("./../config/Biconomy");
const Autograph = require("../models/utilities/autograph");
const Collection = require("../models/collection");

const SingleMint = (redisClient) => {
  //Upload the file to IPFS
  router.post(
    "/upload/single",
    AuthCheck,
    (req, res, next) => RateLimit(redisClient, req, res, next),
    async (req, res) => {
      try {
        const form = formidable({ multiples: true });
        form.maxFileSize = 1 * 1024 * 1024;
        req.setTimeout(0);
        // Gets the stream coming from frontend as fields and files
        form.parse(req, async (err, fields, files) => {
          try {
            if (err) {
              return res.send(500).json({ err });
            }

            if (
              fields.metadata === "" ||
              fields.metadata === null ||
              !fields.metadata
            ) {
              return res.json({
                success: false,
                msg: "Please send a valid wallet metadata",
              });
            }
            if (
              files?.image?.filepath === "" ||
              files?.image?.filepath === null ||
              !files?.image?.filepath
            ) {
              return res.json({
                success: false,
                msg: "Please send a valid image",
              });
            }

            var tempfile = files.image;

            var fileType = tempfile.originalFilename
              .split(".")
              .pop()
              .toUpperCase();

            var fileBuffer = fs.readFileSync(tempfile.filepath);

            var file = new File([fileBuffer], tempfile.originalFilename, {
              type: tempfile.mimetype,
            });

            var tempMetadata = fields.metadata;
            var metadata = JSON.parse(tempMetadata);
            metadata.image = file;
            const supportedFileTypes = [
              "JPG",
              "PNG",
              "JPEG",
              "GIF",
              "SVG",
              "MP4",
              "WEBM",
              "WEBP",
              "MP3",
              "WAV",
              "OGG",
              "GLB",
              "GLTF",
              "GLB",
            ];

            if (!supportedFileTypes.includes(fileType)) {
              console.log("File type not supported - ", fileType);
              return res.status(400).json({
                message: "Image: Invalid file type",
              });
            }

            let tempfile1;
            let cid;

            if (files.asset) {
              if (
                files?.asset?.filepath === "" ||
                files?.asset?.filepath === null ||
                !files?.asset?.filepath
              ) {
                return res.json({
                  success: false,
                  msg: "Please send a valid file",
                });
              }
              tempfile1 = files.asset;
              var fileType1 = tempfile1.originalFilename
                .split(".")
                .pop()
                .toUpperCase();
              var fileBuffer1 = fs.readFileSync(tempfile1.filepath);
              var file1 = new File([fileBuffer1], tempfile1.originalFilename, {
                type: tempfile1.mimetype,
              });
              if (!supportedFileTypes.includes(fileType1)) {
                return res.status(400).json({
                  message: "Asset: Invalid file type",
                });
              }

              try {
                console.log(`Uploading asset to IPFS.....`);
                const storage = new Web3Storage({
                  token: WEB3_STORAGE_KEY,
                });
                cid = await storage.put([file1]);
              } catch (error) {
                console.log(error);
                return res.status(400).json({
                  error: error,
                });
              }

              let animatedURL =
                "ipfs://" + cid + "/" + tempfile1.originalFilename;
              console.log(`Asset IPFS URL - ${animatedURL}`);
              metadata.animation = animatedURL;
              metadata.animation_url = animatedURL;
            }

			let data;
            try {
				console.log("Uploading metadata to IPFS...");
				const nftstorage = new NFTStorage({ token: NFT_STORAGE_KEY });
				data = await nftstorage.store({
				image: file,
				...metadata,
				});
			}
			catch (error) {
				console.log(error);
				return res.status(500).json(error.message);
			}

            delete metadata.image;
            console.log("Uploaded data...");
            console.log(data);

            const assetData = {
              name: tempfile1.originalFilename.split(".")[0],
              type: tempfile1.mimetype,
              ipfs: data.url,
            };

            const newImage = new Image(assetData);
            newImage.save();

            if(data) {
				return res.status(200).json({
					data: data,
				});
			}
          } catch (e) {
            console.log(e);
            return res.status(500).json(e);
          }
        });
      } catch (e) {
        return res.status(500).json(e);
      }
    }
  );

  //Mint an NFT
  router.post(
    "/mint/single",
    [
      check("wallet").notEmpty().withMessage("Wallet is required"),
      check("type").notEmpty().withMessage("Type is required"),
      check("network").notEmpty().withMessage("Network is required"),
      check("tokenUri").notEmpty().withMessage("Token URI is required"),
    ],
    AuthCheck,
    (req, res, next) => RateLimit(redisClient, req, res, next),
    catchAsync(async (req, res) => {
      try {
        req.setTimeout(0);
        let defaultAmount = 1;
        let category = null;
        const { wallet, type, amount, network, tokenCategory, tokenUri } =
          req.body;
        let response;
        console.log("Requested payload", req.body);
        if (amount !== undefined) {
          defaultAmount = amount;
        }

        const fileData = await Image.findOne({ ipfs: tokenUri });
		if(!fileData) {
			return res.status(400).json({message: "IPFS URL not found!"});
		}

        if (tokenCategory) {
          if(tokenCategory === 'soulbound') {
            category = tokenCategory;
          }
          else {
            return res.status(400).json({
              message: 'Invalid token category value. The only supported values are soulbound or null'
            });
          }
        }

        if (!wallet || !type || !network || !tokenUri) {
          return res.status(400).json({
            message: "One of the metadata is empty",
          });
        }
        // Initialize your dapp here like getting user accounts etc
        try {

            if (type === "ERC721") {
              let singleMintERC721ContractAddress =
                globalNFT.ERC721.address;
              if (category) {
                singleMintERC721ContractAddress =
                  globalNFT.SoulBound.address;
              }

              const nft721 = new web3.eth.Contract(
                globalNFT.ERC721.abi,
                singleMintERC721ContractAddress
              );
              try {
                console.log(
                  `${wallet} is Minting ${type} ${
                    category === undefined ? "" : category
                  } on ${network}`
                );
                let txHash = null;
                response = await Promise.race([
                  nft721.methods
                    .mint(wallet, tokenUri)
                    .send({ from: process.env.MINTER, batchId: batchId++ })
                    .on("transactionHash", (hash) => (txHash = hash)),
                  new Promise((res, rej) =>
                    setTimeout(
                      () => rej({ message: "30 second timeout", hash: txHash }),
                      30000
                    )
                  ),
                ]);
              } catch (e) {
                //In case we didn't get the hash even after 30 seconds send response to retry
                if (e.hash === null) {
                  console.log("tx hash null, invalid json error");
                  return res.status(500).send({ message: "Please retry txn" });
                }
                //If we get the transaction hash, save data with status as PENDING.
                if (e && e.hash) {
                  e.wallet = wallet;
                  e.status = "PENDING";

                  const data = {
                    wallet: wallet,
                    tokenURI: tokenUri,
                    type: type,
                    supplyCount: defaultAmount,
                    network: network,
                    tokenCategory: tokenCategory ? tokenCategory : null,
                    transactionHash: e.hash,
                    status: "PENDING",
                    name: fileData.name,
                    imageType: fileData.type,
                  };

                  const newTransaction = new Mint(data);
                  await newTransaction.save();
                  return res.status(200).json({ data: data });
                }
                console.log(e);
                return res.status(500).send(e);
              }
            }

            if (type === "ERC1155") {
              console.log('in erc1155');
              const singleMintERC1155ContractAddress =
                globalNFT.ERC1155.address;
              const nft1155 = new web3.eth.Contract(
                globalNFT.ERC1155.abi,
                singleMintERC1155ContractAddress
              );
              try {
                console.log(
                  `${wallet} is Minting ${type} ${
                    category === undefined ? "" : category
                  } on ${network}`
                );
                let txHash = null;
                response = await Promise.race([
                  nft1155.methods
                    .mint(wallet, tokenUri, defaultAmount)
                    .send({ from: process.env.MINTER, batchId: batchId++ })
                    .on("transactionHash", (hash) => (txHash = hash)),
                  new Promise((res, rej) =>
                    setTimeout(
                      () => rej({ message: "20 second timeout", hash: txHash }),
                      30000
                    )
                  ),
                ]);
              } catch (e) {
                if (e.hash === null) {
                  console.log(
                    `${wallet} : Tx hash null, Please retry transaction`
                  );
                  return res.status(500).send({ message: "Please retry txn" });
                }
                if (e && e.hash) {
                  e.wallet = wallet;
                  e.status = "PENDING";

                  const data = {
                    wallet: wallet,
                    tokenURI: tokenUri,
                    type: type,
                    supplyCount: defaultAmount,
                    network: network,
                    transactionHash: e.hash,
                    status: "PENDING",
                    name: fileData.name,
                    imageType: fileData.type,
                  };

                  const newTransaction = new Mint(data);
                  await newTransaction.save();
                  return res.status(200).json({ data: data });
                }
                console.log(e);
                return res.status(500).send(e);
              }
            }
          let tokenId;
          if (type === "ERC721") {
            tokenId = response.events["Transfer"].returnValues.tokenId;
          } else if (type === "ERC1155") {
            tokenId = response.events["TransferSingle"].returnValues.id;
          }

          const data = {
            wallet: wallet,
            tokenURI: tokenUri,
            type: type,
            supplyCount: defaultAmount,
            network: network,
            tokenCategory: tokenCategory ? tokenCategory : null,
            transactionHash: response.transactionHash,
            tokenId: tokenId,
            status: "CONFIRMED",
            name: fileData.name,
            imageType: fileData.type,
          };

          const newTransaction = new Mint(data);
          await newTransaction.save();

          console.log(`${wallet} Mint success! - ${data.transactionHash}`);

          return res.status(200).json({
            message: "NFT minted successfully",
            data: data,
            response: response.transactionHash,
          });
        } catch (e) {
          console.log(e);
          return res.status(500).json(e);
        }
      } catch (e) {
        console.log(e);
        return res.status(500).json(e.message);
      }
    })
  );

  router.get(
    "/nft/:network/:wallet/:page",
    [check("wallet").notEmpty().withMessage("Wallet is required")],
    AuthCheck,
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }

      const soccerCollectionAddress = "0x9f202e685461B656b5b0e18EbDDCC626837D8aFd";

      const { wallet, page } = req.params;
      try {
        console.log(ALCHEMY_URL);
        const web3 = createAlchemyWeb3(ALCHEMY_URL);

        const reqData = {
          owner: wallet,
          contractAddresses: [
            globalNFT.ERC721.address,
            globalNFT.ERC1155.address,
            globalNFT.SoulBound.address,
            globalNFT.Autograph.address,
            soccerCollectionAddress
          ],
        };

        if (page.toString() !== "0") {
          reqData.pageKey = page;
        }
        const alchmeyNfts = await web3.alchemy.getNfts(reqData);

        const totalNFTs = alchmeyNfts.ownedNfts.length;

        const pageKey = alchmeyNfts.pageKey;
        console.log("pagekey - ", pageKey);

        const nfts = await Mint.find({ wallet: wallet });
        const autographs = await Autograph.find({ wallet: wallet });
        const soccerCollection = await Collection.find({wallet: wallet, contractAddress: soccerCollectionAddress});
        let actualNFTs = [];

        //Filter NFTs owned by the address with alchemy data under mints collection
        for (i = 0; i < totalNFTs; i++) {
          let res = nfts.filter((item) => {
            return item.tokenURI === alchmeyNfts.ownedNfts[i].tokenUri.raw;
          });
          if (res.length > 0) {
            const alchemyData = {
              title: alchmeyNfts.ownedNfts[i].title,
              description: alchmeyNfts.ownedNfts[i].description,
              media: alchmeyNfts.ownedNfts[i].media[0].gateway,
              tokenId: alchmeyNfts.ownedNfts[i].id.tokenId,
              contractAddress: alchmeyNfts.ownedNfts[i].contract.address,
            };

            res = { ...res[0]._doc, ...alchemyData };
            actualNFTs.push(res);
          }
        }

        //Filter NFTs owned by the address with alchemy data under autograph collection
        for (i = 0; i < totalNFTs; i++) {
          let res = autographs.filter((item) => {
            return item.tokenURI === alchmeyNfts.ownedNfts[i].tokenUri.raw;
          });
          if (res.length > 0) {
            const alchemyData = {
              title: alchmeyNfts.ownedNfts[i].title,
              description: alchmeyNfts.ownedNfts[i].description,
              media: alchmeyNfts.ownedNfts[i].media[0].gateway,
              tokenId: alchmeyNfts.ownedNfts[i].id.tokenId,
              contractAddress: alchmeyNfts.ownedNfts[i].contract.address,
            };

            res = { ...res[0]._doc, ...alchemyData };
            actualNFTs.push(res);
          }
        }

        for( i = 0; i < totalNFTs; i++) {
          let res = soccerCollection.filter((item) => {
            return item.tokenURI === alchmeyNfts.ownedNfts[i].tokenUri.raw;
          });

          if (res.length > 0) {
            const alchemyData = {
              title: alchmeyNfts.ownedNfts[i].title,
              description: alchmeyNfts.ownedNfts[i].description,
              media: alchmeyNfts.ownedNfts[i].media[0].gateway,
              tokenId: alchmeyNfts.ownedNfts[i].id.tokenId,
              contractAddress: alchmeyNfts.ownedNfts[i].contract.address,
            };

            res = { ...res[0]._doc, ...alchemyData };
            actualNFTs.push(res);
          }
        }

        if (!nfts) {
          return res.status(404).json({
            message: "User not found",
          });
        }

        const responseObj = {
          pageKey: alchmeyNfts.pageKey || 0,
          actualNFTs,
        };
        return res.status(200).json(responseObj);
      } catch (error) {
        return res.status(500).json({
          message: error.message,
        });
      }
    }
  );

  router.get("/nft/:contractAddress/:tokenId", AuthCheck, async (req, res) => {
    const { contractAddress, tokenId } = req.params;

    try {
      console.log(ALCHEMY_URL);
      const web3 = createAlchemyWeb3(ALCHEMY_URL);

      let response = await web3.alchemy.getNftMetadata({
        contractAddress,
        tokenId,
      });

      if(contractAddress === "0x9f202e685461B656b5b0e18EbDDCC626837D8aFd"){
        const data =  await Collection.find({tokenId:tokenId,tokenURI:response.tokenUri.raw});
        let finalData = { ...response, transactionHash: data[0].transactionHash };

        return res.status(200).json(finalData);
      }else{

        const data = await Mint.find({
          tokenId: tokenId,
          tokenURI: response.tokenUri.raw,
        });
  
        let finalData = { ...response, transactionHash: data[0].transactionHash };
  
        return res.status(200).json(finalData);
      }

    } catch (e) {
      console.log(e);
      return res.status(500).json(e);
    }
  });

  //Get the status of the resubmitted transaction
  router.get("/biconomy/:hash", async (req, res) => {
    const { hash } = req.params;
    const response = await axios.get(
      "https://api.biconomy.io/api/v1/meta-tx/resubmitted",
      {
        headers: {
          "Content-Type": "application/json",
        },

        params: {
          transactionHash: hash,
          networkId: networkId,
        },
      }
    );
    return res.status(200).json(response.data);
  });

  return router;
};

module.exports = SingleMint;