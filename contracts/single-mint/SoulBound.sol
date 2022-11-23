///////////////////////////////////////////////////////////
//                                                       //
//     Built with Cope.studio (https://cope.studio)      //
//     Powered by Polygon (https://polygon.technology/)  //
//                                                       //
///////////////////////////////////////////////////////////



// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";


contract SoulBound is ERC721URIStorage, ERC2771Context, Ownable {

    //TODO: change the forwarder address while deploying to mainnet - 0x86C80a8aa58e0A4fa09A69624c31Ab2a6CAD56b8
    //Testnet: 0x9399BB24DBB5C4b782C70c2969F58716Ebbd6a3b
    constructor(address _forwarder) ERC721("Polygon NFT", "NFT") ERC2771Context(_forwarder) {}

    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    //This should be overriden in this contract since both context.sol and ERC2771Context.sol have the same function name and params.
    function _msgSender() 
        internal view override(ERC2771Context, Context) 
        returns (address sender) 
    {
        sender = ERC2771Context._msgSender();
    }

        //This should be overriden in this contract since both context.sol and ERC2771Context.sol have the same function name and params.
    function _msgData() 
        internal view virtual override(ERC2771Context, Context) 
        returns (bytes calldata) 
    {
        return ERC2771Context._msgData();
    }

    //Overriding and reverting all transfer function.
    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) public pure override {
        revert('The NFT is bounded to your soul, you cannot transfer it!');
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId
    ) public pure override {
        revert('The NFT is bounded to your soul, you cannot transfer it!');
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        bytes memory _data
    ) public pure override {
        revert('The NFT is bounded to your soul, you cannot transfer it!');
    }

    // Mint NFTs
    function mint(address to, string memory uri) public returns(uint256) {
        _tokenIds.increment();

        uint256 newItemId = _tokenIds.current();
        _mint(to, newItemId);
        _setTokenURI(newItemId, uri);

        return newItemId;
    }

}