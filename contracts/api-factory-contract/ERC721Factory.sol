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
import "@openzeppelin/contracts/utils/Strings.sol";


contract MintNFT721 is ERC721URIStorage, ERC2771Context, Ownable {

    address public trustedForwarder;
    address public collectionOwner;
    address public collectionMinter;

    //TODO: change the forwarder address while deploying to mainnet - 0x86C80a8aa58e0A4fa09A69624c31Ab2a6CAD56b8
    //Testnet: 0x9399BB24DBB5C4b782C70c2969F58716Ebbd6a3b
    constructor(string memory _name, string memory _symbol, address _owner, address _forwarder, address _collectionMinter) ERC721(_name, _symbol) ERC2771Context(_forwarder) {
        collectionOwner = _owner;
        trustedForwarder = _forwarder;
        collectionMinter = _collectionMinter;
    }
    using Strings for uint256;

    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    event BatchMintERC721(uint256[] mintedIds);

    //This should be overriden in this contract since both context.sol and ERC2771Context.sol have the same function name and params.
    function _msgSender() internal view override(ERC2771Context, Context) returns (address sender) {
        sender = ERC2771Context._msgSender();
    }

    //This should be overriden in this contract since both context.sol and ERC2771Context.sol have the same function name and params.
    function _msgData() internal view virtual override(ERC2771Context, Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }


    function mint(address to, string memory _uri) external {
        require(_msgSender() == collectionOwner || _msgSender() == collectionMinter, "Not a owner!");

       _tokenIds.increment();

        uint256 newItemId = _tokenIds.current();
        _mint(to, newItemId);
        _setTokenURI(newItemId, _uri);
    }

    function burn(uint256 tokenId) public {
        require(ownerOf(tokenId) == _msgSender(), 'Caller is not the owner!');
        super._burn(tokenId);
    }
}

contract ERC721Factory is ERC2771Context, Ownable {

    mapping(string => bool) public sessionTracker;
    address public trustedForwarder;
    address public operator;

    constructor(address _operator, address _forwarder) ERC2771Context(_forwarder) {
        trustedForwarder = _forwarder;
        operator = _operator;
    }

    event CollectionCreation(address indexed collectionAddress, address indexed collector);

    mapping(address => mapping(string => address)) public collectionRecords;

    //This should be overriden in this contract since both context.sol and ERC2771Context.sol have the same function name and params.
    function _msgSender() internal view override(ERC2771Context, Context) returns (address sender) {
        sender = ERC2771Context._msgSender();
    }

    //This should be overriden in this contract since both context.sol and ERC2771Context.sol have the same function name and params.
    function _msgData() internal view virtual override(ERC2771Context, Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }

    function createCollection(address collector, string calldata _session, string memory _name, string memory _sybmol) external {
        require(!sessionTracker[_session], "Collection already deployed with the provided session ID");
        require(collector != address(0), "Collector address should not be zero!");
        MintNFT721 collection = new MintNFT721(_name, _sybmol, collector, trustedForwarder, address(this));
        collectionRecords[collector][_session] = address(collection);
        sessionTracker[_session] = true;
        emit CollectionCreation(address(collection), collector);
    }

    function mintUnderCollection(address collection, string calldata _session, address to, string memory _uri) external {
        if(_msgSender() == operator || collectionRecords[_msgSender()][_session] == address(collection)) {
            MintNFT721(collection).mint(to, _uri);
        } else {
            revert('Not allowed to mint under this contract!');
        } 
    }
}