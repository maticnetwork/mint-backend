const express = require("express");
const router = express.Router();

const { check, validationResult } = require("express-validator");
const AuthCheck = require("../../middleware/API");
const Gift = require("../../models/utilities/gift");

const Autograph = require('../../models/utilities/autograph')
const Mint = require("../../models/mint")

const Web3 = require("web3");
const HDWalletProvider = require("@truffle/hdwallet-provider");

const ERC721SingleMintAbi = require("../../abis/ERC721SingleMint.json");
let { web3, biconomy,batchId } = require("../../config/Biconomy");
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const PROVIDER_URL = process.env.PROVIDER_URL;

let keys = [PRIVATE_KEY];
const provider = new HDWalletProvider({
  privateKeys: keys,
  providerOrUrl: PROVIDER_URL,
  chainId: "any",
});

router.post(
  "/drop",
  [
    check("wallet").notEmpty().withMessage("Wallet is required"),
    check("to").notEmpty().withMessage("to Address is required"),
    check("type").notEmpty().withMessage("Type is required"),
    check("network").notEmpty().withMessage("Network is required"),
    check("txhash").notEmpty().withMessage("Transaction Hash is required"),
    check("tokenID").notEmpty().withMessage("Token ID is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        errors: errors.array(),
      });
    }
    const { wallet, to, network, type,txhash,tokenID } = req.body;

    try {
      const check = await Mint.findOne({
        transactionHash: txhash,
      });
      const autograph = await Autograph.findOne({ transactionHash: txhash })
      if(!check || !autograph){
        return res.status(400).json({
            error: "Transaction not found"
        });
    }
     
      let response;
      let defaultAmount = req.body.supplyCount ? req.body.supplyCount : 1;
      try {
        if(network == "mumbai") {
          if(type === 'ERC721') {
            let singleMintERC721ContractAddress = '0x8021701ced6e9b8376a165efe00c26d86de15a41';
      
            const nft721 = new web3.eth.Contract(ERC721SingleMintAbi.abi, singleMintERC721ContractAddress);
            try {
              response = await nft721.methods.safeTransferFrom(wallet, to,tokenID).send({from: process.env.MINTER, batchId: batchId++});
              console.log(response)
            } catch(e) {
              console.log(e);
              return res.status(500).send(e);
            } 
          } 
       
          if(type === 'ERC1155') {
            const singleMintERC1155ContractAddress = '0x59279d6CA4F2F5b772185cf489a0295abe03982e';
            const nft1155 = new web3.eth.Contract(ERC1155SingleMintAbi.abi, singleMintERC1155ContractAddress);
            try {
              response = await nft1155.methods.safeTransferFrom(wallet, to, tokenID,defaultAmount,"0x00").send({from: process.env.MINTER, batchId: batchId++});
            } catch(e) {
              console.log(e);
              return res.status(500).send(e);
            }
          }
        }
        const data = {
          wallet: wallet,
          to: to,
          type: type,
          network: network,
          transactionHash: txhash	
        }
        const autographedNFT = autograph ? true : false 
        if(autographedNFT){
          await Autograph.findOneAndUpdate({
            transactionHash: txhash
          }, {
            gift: true
        })
        }
        else {
        await Mint.findOneAndUpdate({
          transactionHash: txhash
        }, {
          gift: true
      })
    }
        const newTransaction = new Gift(data);
        await newTransaction.save();
     
        return res.status(200).json({
           message: "NFT transferred successfully",
           data: data,
           response: response.transactionHash
        });
      } catch (e) {
        console.log(e);
        return res.status(500).json({
          message: "Something went wrong",
          error: e,
        })
      }

    } catch (err) {
      console.error(err.message);
      return res.status(500).send(err);
    }
  }
);

router.post('/transfer', AuthCheck, async(req, res) => {
  try {
        const {newOwner, txHash} = req.body;
        const mintItem = await Mint.findOne({transactionHash: txHash});
        const autographItem = await Autograph.findOne({transactionHash: txHash});
        if(!mintItem && !autographItem) {
            return res.status(400).json({
                error: "Transaction not found"
            });
        }
        if(mintItem) {
            await Mint.findOneAndUpdate({transactionHash: txHash}, {wallet: newOwner});
        } else if(autographItem) {
            await Autograph.findOneAndUpdate({transactionHash: txHash}, {wallet: newOwner});
        }
        
        return res.status(200).json({message: 'Update success', newOnwer: newOwner, transactionHash: txHash});

    } catch(e) {
        return res.status(500).json(e);
    }
});

module.exports = router;
