///////////////////////////////////////////////////////////
//                                                       //
//     Built with Cope.studio (https://cope.studio)      //
//     Powered by Polygon (https://polygon.technology/)  //
//                                                       //
///////////////////////////////////////////////////////////



// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "@openzeppelin/contracts/utils/Counters.sol";


contract MintNFT1155 is ERC1155, ERC2771Context, Ownable  {

    string public name;
    string public symbol;
    address public trustedForwarder;
    address public collectionOwner;
    address public collectionMinter;

    //TODO: change the forwarder address while deploying to mainnet - 0x86C80a8aa58e0A4fa09A69624c31Ab2a6CAD56b8
    //Testnet: 0x9399BB24DBB5C4b782C70c2969F58716Ebbd6a3b
    constructor(string memory _name, string memory _symbol, address _owner, address _forwarder, address _minter) ERC1155("") ERC2771Context(_forwarder) {
        name = _name;
        symbol = _symbol;
        trustedForwarder = _forwarder;
        collectionOwner = _owner;
        collectionMinter = _minter;
    }

    function setURI(string memory newuri) public onlyOwner {
        _setURI(newuri);
    }

    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    mapping(uint256 => string) public tokenURI;

    //This should be overriden in this contract since both context.sol and ERC2771Context.sol have the same function name and params.
    function _msgSender() internal view override(ERC2771Context, Context) returns (address sender) {
        sender = ERC2771Context._msgSender();
    }

        //This should be overriden in this contract since both context.sol and ERC2771Context.sol have the same function name and params.
    function _msgData() internal view virtual override(ERC2771Context, Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }

    function mint(
        address to,
        string memory _uri,
        uint256 amount
    ) external
    {
         require(_msgSender() == collectionOwner || _msgSender() == collectionMinter, "Not a owner!");
        _tokenIds.increment();

        uint256 newItemId = _tokenIds.current();
        _mint(to, newItemId, amount, "");
        setURI(newItemId, _uri);


    }

    function setURI(uint256 _id, string memory _uri) internal {
        tokenURI[_id] = _uri;
    }

    function uri(uint256 _id) public view override returns (string memory) {
        return tokenURI[_id];
    }

    function burn(uint256 tokenId, uint256 amount) public {
        uint256 balance = balanceOf(_msgSender(), tokenId);
        require(balance > 0, "ERC1155: Caller is not the owner");
        super._burn(_msgSender(), tokenId, amount);
    }

}

contract ERC1155Factory is ERC2771Context, Ownable {

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
        MintNFT1155 collection = new MintNFT1155(_name, _sybmol, collector, trustedForwarder, address(this));
        collectionRecords[collector][_session] = address(collection);
        sessionTracker[_session] = true;
        emit CollectionCreation(address(collection), collector);
    }

    function mintUnderCollection(address collection, string calldata _session, address to, string memory _uri, uint256 _amount) external {
        if(_msgSender() == operator || collectionRecords[_msgSender()][_session] == address(collection)) {
            MintNFT1155(collection).mint(to, _uri, _amount);
        } else {
            revert('Not allowed to mint under this contract!');
        } 
    }
}