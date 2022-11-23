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


contract PolygonNFT1155 is ERC1155, ERC2771Context, Ownable  {

    string public name;
    string public symbol;
    address public trustedForwarder;

    //TODO: change the forwarder address while deploying to mainnet - 0x86C80a8aa58e0A4fa09A69624c31Ab2a6CAD56b8
    //Testnet: 0x9399BB24DBB5C4b782C70c2969F58716Ebbd6a3b
    constructor(string memory _name, string memory _symbol, address _forwarder) ERC1155("") ERC2771Context(_forwarder) {
        name = _name;
        symbol = _symbol;
        trustedForwarder = _forwarder;
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
    ) public returns(uint256)
    {
        _tokenIds.increment();

        uint256 newItemId = _tokenIds.current();
        _mint(to, newItemId, amount, "");
        setURI(newItemId, _uri);

        return newItemId;

    }

    function setURI(uint256 _id, string memory _uri) internal {
        tokenURI[_id] = _uri;
    }

    function uri(uint256 _id) public view override returns (string memory) {
        return tokenURI[_id];
    }

}


