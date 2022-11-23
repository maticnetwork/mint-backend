// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.4;

// import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
// import "@openzeppelin/contracts/access/Ownable.sol";
// import "@openzeppelin/contracts/utils/Counters.sol";
// import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
// import "@opengsn/contracts/src/BaseRelayRecipient.sol";


// contract PolygonNFT721 is ERC721URIStorage, BaseRelayRecipient, Ownable {

//     //TODO: change the forwarder address while deploying to mainnet - 0x86C80a8aa58e0A4fa09A69624c31Ab2a6CAD56b8
//     constructor(address _trustedForwarder) ERC721("Polygon NFT", "NFT") {
//         trustedForwarder = _trustedForwarder;
//     }

//     function versionRecipient() external virtual override view returns (string memory) { return '1'; }

//     using Counters for Counters.Counter;
//     Counters.Counter private _tokenIds;

//     //This should be overriden in this contract since both context.sol and ERC2771Context.sol have the same function name and params.
//     function _msgSender() internal view override(BaseRelayRecipient, Context) returns (address sender) {
//         sender = BaseRelayRecipient._msgSender();
//     }

//         //This should be overriden in this contract since both context.sol and ERC2771Context.sol have the same function name and params.
//     function _msgData() internal view virtual override(BaseRelayRecipient, Context) returns (bytes calldata) {
//         return BaseRelayRecipient._msgData();
//     }

//     // Mint NFTs
//     function mint(address to, string memory uri) public returns(uint256) {
//         _tokenIds.increment();

//         uint256 newItemId = _tokenIds.current();
//         _mint(to, newItemId);
//         _setTokenURI(newItemId, uri);

//         return newItemId;
//     }

// }