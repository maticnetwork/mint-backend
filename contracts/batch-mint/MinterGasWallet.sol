///////////////////////////////////////////////////////////
//                                                       //
//     Built with Cope.studio (https://cope.studio)      //
//     Powered by Polygon (https://polygon.technology/)  //
//                                                       //
///////////////////////////////////////////////////////////



// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol";


contract MinterGasWallet is Initializable, ERC2771ContextUpgradeable, UUPSUpgradeable {

    //Address of the operator
    address public OPERATOR;
    address public trustedForwarder;
    address public owner;

    uint256 public totalFeeCollected;

    // Forwarder Address
    // Mainnet - 0x86C80a8aa58e0A4fa09A69624c31Ab2a6CAD56b8
    // Testnet: 0x9399BB24DBB5C4b782C70c2969F58716Ebbd6a3b
    constructor(address _trustedForwarder) ERC2771ContextUpgradeable(_trustedForwarder) {
        trustedForwarder = _trustedForwarder;
    }

    function initialize(address _operator, address _trustedForwarder, address _owner) 
        public 
        initializer
    {
        OPERATOR = _operator;
        trustedForwarder = _trustedForwarder;
        owner = _owner;

    }

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

    //Revert the call if any matic sent directly to the contract
    receive() external payable { revert("Execution reverted on Receive"); }

    fallback() external payable { revert("Execution reverted on Fallback"); }

    mapping(address => mapping(string => uint256)) private balance;

    event GasDeposit(address indexed payer, string sessionId, uint256 indexed value);
    event Refund(address indexed account, string sessionId, uint256 indexed amount);

    //Deposit the matic 
    function depositGas(string calldata _sessionId)
        public 
        payable 
    {
        balance[msg.sender][_sessionId] += msg.value;
        emit GasDeposit(msg.sender, _sessionId, msg.value);
    }

    //Refund the gas amount back to the user, only opertor can call this function
    function refundGas(address account, uint256 gasFeeUtilized, string calldata _sessionId) 
        public 
        onlyOperator 
    {
        uint256 amount = balanceOf(account, _sessionId);

        require(amount > 0, "Insufficient balance to refund");
        require(amount > gasFeeUtilized, "Gas uitlized is more than deposited balance!");

        uint refundAmount = balanceOf(account, _sessionId) - gasFeeUtilized;
        totalFeeCollected += gasFeeUtilized;
        balance[account][_sessionId] = 0;

        (bool success, ) = payable(account).call{value:refundAmount}("");
        require(success, "Matic refund failed!");

        (bool transferSuccess, ) = payable(owner).call{value:gasFeeUtilized}("");
        require(transferSuccess, "Matic transfer to operator failed!");

        emit Refund(account, _sessionId, refundAmount);
    }

    //Returns the balance of the address
    function balanceOf(address account, string calldata _sessionId) 
        public 
        view 
        returns(uint256) 
    {
        return balance[account][_sessionId];
    }

    //Withdraw any ERC20 tokens accidentally sent to our contract
    function withdrawERC20(IERC20 _address) 
        public 
        onlyOperator 
    {
        uint256 amount = IERC20(_address).balanceOf(address(this));
        IERC20(_address).transfer(msg.sender, amount);
    }

}