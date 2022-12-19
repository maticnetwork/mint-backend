# NFT Minter Backend
0xmint.io is a platform to make the minting experience easier & smoother for both users & developers. The aim is for anyone to come on the platform and have a smooth minting experience that suits their needs.

- For users who’re just venturing into web3, Quick Mint is the best way to onboard them. It allows them to mint their single NFTs in just 3 clicks - and for free! It supports all major file types under 100MB.
- For NFT artists and creators who mint their art very often, Batch Mint is the feature for them. Batch Mint enables the minting of thousands of NFTs at once - with a single click and minimal gas fee!
- “I’ve minted my NFT. Now what?” Well, now you can add utilities to your NFTs. Add an autograph, send it as a gift, order a phygital version or add unlockable content. Make your NFT truly your own.
- Mint NFTs and create your own customized claim page. By creating a claim page, you have control over which wallets can claim your NFT, assign a date range, and even limit the number of NFTs that can be claimed.
- Integrating Mint NFT into your dApps is completely free. We provide an open API for Single Minting and Batch Minting. Developers and people leading NFT projects can easily plug the API into their projects and create seamless minting experiences.


# Installation

### Development
```bash
npm install
npm run dev
```

### Production
```bash
npm install
npm start
```

## Dependencies
The following dependencies has to be used for the application to function in the desirable manner.

```bash
NFT_STORAGE_KEY =     //https://nft.storage/
WEB3_STORAGE_KEY =    //https://web3.storage/
MONGODB = 
JWT_SECRET = 
MINTER =              //Minter/operator wallet address
PRIVATE_KEY =         //Private key of minter/operator
BICONOMY =            //https://www.biconomy.io/
BICONOMY_MAINNET = 
PROVIDER_URL_MAINNET = //Any node provider url for Mainnet
PROVIDER_URL =         //Any node proivder url for Testnet
REDIS_DB = 

AWS_REGION =
AWS_ACCESS_KEY =
AWS_SECRET_ACCESS_KEY =
S3_MEDIA_BUCKET =


DISCORD_CLIENT = 
DISCORD_SECRET = 
DISCORD_CALLBACK =
TWITTER_CLIENT = 
TWITTER_SECRET = 
TWITTER_CALLBACK = 
```

### Mainnet contract links
**Single mint:**
- ERC721 -> https://polygonscan.com/address/0x03e055692e77e56aBf7f5570D9c64C194BA15616#code
- ERC1155 -> https://polygonscan.com/address/0xe2f50189F8c1e3804AEb854C9eBFFB92Ba9d3270#code
- SoulBound -> https://polygonscan.com/address/0x42C091743f7B73b2F0043B1fb822b63Aaa05041B#code
- Autograph -> https://polygonscan.com/address/0xE2aDba225105451Dd07605c78Aa869e797C87467#code

**Batchmint:**
- Batchmint ERC721 Factory -> https://polygonscan.com/address/0x1aF7768737e41D227Fd0f6330Ed7B0ad846A8B73#code
- Gas Fee Handler Proxy -> https://polygonscan.com/address/0xb3E5FA3F9e1DF2b8274c9c8568716d7A23066C0f#code
- Gas Fee Handler implementation -> https://polygonscan.com/address/0xf0dd1d55c3380d0a4e66f06f2af70dc9adb09365#code

**Single mint API Factory contracts:**
- ERC721 Factory -> https://polygonscan.com/address/0xc42CFAc5244c9e232fb3BA628A246FCD552A0009#code
- ERC1155 Factory -> https://polygonscan.com/address/0x1eeE83F2784ff230BbD24BE3ad6CCAe956f463D8#code

**Claim page:**
Proxy -> https://polygonscan.com/address/0x431d93aA78c771FD65998478D457C0daF6bAF75b#code
Implementation -> https://polygonscan.com/address/0x17cc193b77491e5439a5a4eb97799bfb327279b9#code