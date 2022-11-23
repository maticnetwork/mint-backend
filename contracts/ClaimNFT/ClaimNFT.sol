///////////////////////////////////////////////////////////
//                                                       //
//     Built with Cope.studio (https://cope.studio)      //
//     Powered by Polygon (https://polygon.technology/)  //
//                                                       //
///////////////////////////////////////////////////////////


// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.9;

import "@openzeppelin/contracts/interfaces/IERC721.sol";
import "@openzeppelin/contracts/interfaces/IERC1155.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol";


contract ClaimNFT is Initializable, ERC2771ContextUpgradeable, UUPSUpgradeable {

    event RegistrationERC721(address indexed from, address indexed to, uint256 indexed tokenId, address contractAddress);
    event ERC721Claim(address indexed to, uint256 indexed tokenId, address contractAddress);
    event RegistrationERC1155(address indexed from, uint256 indexed tokenId, uint256 indexed supply, address contractAddress);
    event ERC1155Claim(address indexed to, uint256 indexed tokenId, uint256 indexed supply, address contractAddress);
    event SessionCancel(address indexed by, string sessioinID);

    address public trustedForwarder;
    address public OPERATOR;
    address public owner;

    //Biconomy forwarder
    //Mainnet: 0x86C80a8aa58e0A4fa09A69624c31Ab2a6CAD56b8
    //Testnet: 0x9399BB24DBB5C4b782C70c2969F58716Ebbd6a3b
    constructor(address _forwarder)  ERC2771ContextUpgradeable(_forwarder) {
        trustedForwarder = _forwarder;
    }

    function initialize(address _operator, address _trustedForwarder, address _owner) 
        public 
        initializer
    {
        OPERATOR = _operator;
        trustedForwarder = _trustedForwarder;
        owner = _owner;
    }


    struct RegisterERC1155 {
        address contractAddress;
        address owner;
        uint256 tokenId;
        uint256 supply;
        uint256 limit;
        uint256 from;
        uint256 to;
    }

    struct RegisterERC721 {
        address contractAddress;
        address owner;
        address toAddress;
        uint256 tokenId;
        uint256 from;
        uint256 to;
    }

    struct RegisterListERC1155 {
        address contractAddress;
        address owner;
        uint256 tokenId;
        uint256 from;
        uint256 to;
    }


    mapping(string => RegisterERC721) public registrationRecordERC721;
    mapping(string => RegisterERC1155) public registrationRecordERC1155;
    mapping(string => RegisterListERC1155) public registrationListRecord;

    mapping(string => mapping(address => uint256)) public whitelistAddressAndSupply;
    mapping(string => mapping(address => bool)) public isClaimed;
    mapping(string => uint256) public totalERC1155Claimed;
    mapping(string => bool) public isSessionUsed;
    mapping(string => bool) public isCancelled;
    mapping(string => bool) public isERC721Claimed;

    //This should be overriden in this contract since both context.sol and ERC2771Context.sol have the same function name and params.
    function _msgSender() internal view override(ERC2771ContextUpgradeable) returns (address sender) {
        sender = ERC2771ContextUpgradeable._msgSender();
    }

        //This should be overriden in this contract since both context.sol and ERC2771Context.sol have the same function name and params.
    function _msgData() internal view virtual override(ERC2771ContextUpgradeable) returns (bytes calldata) {
        return ERC2771ContextUpgradeable._msgData();
    }

    function _authorizeUpgrade(address newImplementation) 
        internal 
        override 
        onlyOperator {}

    modifier onlyOperator() {
        require( _msgSender() == OPERATOR, "Permission denied!");
        _;
    }


    function registerERC721(string memory _sessionId, address _contractAddress, uint256 _tokenId, address _owner, address _toAddress, uint256 _from, uint256 _to) external {
        require(registrationRecordERC721[_sessionId].contractAddress == address(0), "Session already exist!");
        require(IERC721(_contractAddress).ownerOf(_tokenId) == _msgSender(), "Claim: ERC721, The provided address is not the owner");
        require(!isSessionUsed[_sessionId], "Session in use!");
        RegisterERC721 memory data = RegisterERC721({
            contractAddress: _contractAddress,
            owner: _owner,
            toAddress: _toAddress,
            tokenId: _tokenId,
            from: _from,
            to: _to
        });

        isSessionUsed[_sessionId] = true;
        registrationRecordERC721[_sessionId] = data;
        emit RegistrationERC721(_owner, _toAddress, _tokenId, _contractAddress);
    }

    function registerERC1155(string memory _sessionId, address _contractAddress, uint256 _tokenId, address _owner, uint256 _supply, uint256 _limit, uint256 _from, uint256 _to) external {
        require(registrationRecordERC1155[_sessionId].contractAddress == address(0), "Session already exist!");
        require(!isSessionUsed[_sessionId], "Session in use!");
        require(IERC1155(_contractAddress).balanceOf(_owner, _tokenId) >= _supply, "Claim: ERC1155, Insufficient balance");
        RegisterERC1155 memory data = RegisterERC1155({
            contractAddress: _contractAddress,
            owner: _owner,
            tokenId: _tokenId,
            supply: _supply,
            limit: _limit,
            from: _from,
            to: _to
        });

        isSessionUsed[_sessionId] = true;
        registrationRecordERC1155[_sessionId] = data;
        emit RegistrationERC1155(_owner, _tokenId, _supply, _contractAddress);
    }

    function registerListERC1155(string memory _sessionId, address _contractAddress, uint256 _tokenId, address _owner, uint256 _from, uint256 _to) external {
        require(registrationListRecord[_sessionId].contractAddress == address(0), "Session already exist!");
        require(!isSessionUsed[_sessionId], "Session in use!");
        RegisterListERC1155 memory data = RegisterListERC1155({
            contractAddress: _contractAddress,
            owner: _owner,
            tokenId: _tokenId,
            from: _from,
            to: _to
        });

        isSessionUsed[_sessionId] = true;
        registrationListRecord[_sessionId] = data;
    }

    function whitelistERC1155(string memory _sessioinId, address[] calldata _addressess, uint256[] calldata _supplies) external onlyOperator {
        for(uint256 i = 0; i < _addressess.length; i++) {
            whitelistAddressAndSupply[_sessioinId][_addressess[i]] = _supplies[i];
        }
    }

    function claimSingleERC721(string memory _sessionId) public {
        require(!isCancelled[_sessionId], "Session is cancelled!");
        require(!isERC721Claimed[_sessionId], "NFT already claimed!");
        RegisterERC721 memory data = registrationRecordERC721[_sessionId];
        if(data.to > 0) {
            require(block.timestamp >= data.from && block.timestamp <= data.to, "Session expired!");
        }
        address toAddress = _msgSender();
        if(data.toAddress != address(0)) {
            require(_msgSender() == data.toAddress, "Address not reserved!");
            toAddress = data.toAddress;
        }
        isERC721Claimed[_sessionId] = true;
        registrationRecordERC721[_sessionId] = data;
        IERC721 contract721 = IERC721(data.contractAddress);
        contract721.safeTransferFrom(data.owner, toAddress, data.tokenId);
        emit ERC721Claim(toAddress, data.tokenId, data.contractAddress);
    }

    function claimERC1155(string memory _sessionId) public {
        require(!isCancelled[_sessionId], "Session is cancelled!");
        RegisterERC1155 memory data = registrationRecordERC1155[_sessionId];
        require(!isClaimed[_sessionId][_msgSender()], "Already claimed!");
        require(totalERC1155Claimed[_sessionId] < data.supply, "All tokens claimed");
        if(data.to > 0) {
            require(block.timestamp >= data.from && block.timestamp <= data.to, "Session expired!");
        }
        totalERC1155Claimed[_sessionId] += data.limit;
        isClaimed[_sessionId][_msgSender()] = true;
        IERC1155 contract1155 = IERC1155(data.contractAddress);
        contract1155.safeTransferFrom(data.owner, _msgSender(), data.tokenId, data.limit, "0x");
        emit ERC1155Claim(_msgSender(), data.tokenId, data.limit, data.contractAddress);
    }

    function claimListERC1155(string memory _sessionId) public {
        require(!isCancelled[_sessionId], "Session is cancelled!");
        RegisterListERC1155 memory data = registrationListRecord[_sessionId];
        if(data.to > 0) {
            require(block.timestamp >= data.from && block.timestamp <= data.to, "Session expired!");
        }
        uint256 supply = whitelistAddressAndSupply[_sessionId][_msgSender()];
        require(supply > 0, "Address not whitelisted!");
        require(!isClaimed[_sessionId][_msgSender()], "Already claimed!");
        totalERC1155Claimed[_sessionId] += supply;
        isClaimed[_sessionId][_msgSender()] = true;
        IERC1155 contract1155 = IERC1155(data.contractAddress);
        contract1155.safeTransferFrom(data.owner, _msgSender(), data.tokenId, supply, "0x");
    }

    function cancel(string memory _sessionId) external {
        require(isSessionUsed[_sessionId], "Session doesn't exist!");
        require(!isCancelled[_sessionId], "Session is already canceled!");
        RegisterListERC1155 memory listdata = registrationListRecord[_sessionId];
        RegisterERC721 memory erc721data = registrationRecordERC721[_sessionId];
        RegisterERC1155 memory erc1155data = registrationRecordERC1155[_sessionId];
        if(listdata.owner != address(0)) {
            require(_msgSender() == listdata.owner || _msgSender() == OPERATOR);
        } else

        if(erc721data.owner != address(0)) {
            require(_msgSender() == erc721data.owner || _msgSender() == OPERATOR);
        } else

        if(erc1155data.owner != address(0)) {
            require(_msgSender() == erc1155data.owner || _msgSender() == OPERATOR);
        } else {
            return;
        }

        isCancelled[_sessionId] = true;
        emit SessionCancel(_msgSender(), _sessionId);
    }

    function resume(string memory _sessionId) external onlyOperator {
        require(!isSessionUsed[_sessionId], "Session doesn't exist!");
        isCancelled[_sessionId] = false;
    }
}