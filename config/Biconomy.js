const Web3 = require("web3");
const HDWalletProvider = require("@truffle/hdwallet-provider");
const { Biconomy } = require('@biconomy/mexa');
const { priority } = require("agenda/dist/job/priority");


const PRIVATE_KEY = process.env.PRIVATE_KEY;
const PROVIDER_URL_MAINNET = "wss" + process.env.PROVIDER_URL_MAINNET.substring(5, process.env.PROVIDER_URL_MAINNET.length);
const BICONOMY_MAINNET = process.env.BICONOMY_MAINNET;
const PROVIDER_URL = process.env.PROVIDER_URL;
const BICONOMY = process.env.BICONOMY;

let ALCHEMY_URL;

let providerUrl;
let biconomyApi;
let globalNFT;
let globalClaim;
let networkId;
let gasTank;
let nftFactory;
if(process.env.TEST === 'true') {
    console.log('in testnet');
    providerUrl = PROVIDER_URL;
    biconomyApi = BICONOMY;
    globalNFT = require('../nftGlobalTestnet.json');
    globalClaim = require('../claimGlobalTestnet.json');
    nftFactory = require('../nftFactoryTestnet.json');
    gasTank = require('../abis/GasTankABITestnet.json');

    networkId = '80001';
    ALCHEMY_URL = "https" + process.env.PROVIDER_URL.substring(3, process.env.PROVIDER_URL.length);
} else {
    console.log('in mainnet')
    providerUrl =  process.env.PROVIDER_URL_MAINNET;
    biconomyApi =  BICONOMY_MAINNET;
    globalNFT = require('../nftGlobalMainnet.json');
    globalClaim = require('../claimGlobalMainnet.json');
    nftFactory = require('../nftFactoryMainnet.json');
    gasTank = require('../abis/GasTankABIMainnet.json');

    networkId = '137';
    ALCHEMY_URL = process.env.PROVIDER_URL_MAINNET;
}


let batchId = 1;
let keys = [PRIVATE_KEY];
const provider = new HDWalletProvider({
	privateKeys: keys,
	providerOrUrl: providerUrl,
	// chainId: "any"
});
const biconomy = new Biconomy(new Web3.providers.HttpProvider(providerUrl), 
    {apiKey: biconomyApi, strictMode: true, walletProvider: provider});
const web3 = new Web3(biconomy);
const web3N = new Web3(provider);


async function biconomyInit() {
    try{
        biconomy.onEvent(biconomy.READY, async() => {
            console.log("Biconomy is ready");
        })
        .onEvent(biconomy.ERROR, (error,message) => {
            console.log(error,message);
        }) 
    } catch(error){
        console.log(error);
    }
}



module.exports = {
    biconomy,
    web3,
    biconomyInit,
    batchId,
    globalNFT,
    globalClaim,
    networkId,
    gasTank,
    nftFactory,
    web3N,
    ALCHEMY_URL
}