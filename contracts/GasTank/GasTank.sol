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

contract GasTank is Initializable, ERC2771ContextUpgradeable, UUPSUpgradeable {

    //Address of the operator
    address public OPERATOR;
    address public masterAccount;

    // Forwarder Address
    // Mainnet - 0x86C80a8aa58e0A4fa09A69624c31Ab2a6CAD56b8
    // Testnet: 0x9399BB24DBB5C4b782C70c2969F58716Ebbd6a3b
    constructor(address _trustedForwarder) ERC2771ContextUpgradeable(_trustedForwarder) {}

    function initialize(address _operator, address _owner) 
        public 
        initializer
    {
        OPERATOR = _operator;
        masterAccount = _owner;
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

    mapping(address => uint256) private balance;

    event GasDeposit(address indexed payer, uint256 indexed value);

    //Deposit the matic 
    function depositGas()
        public 
        payable 
    {
        balance[_msgSender()] += msg.value;
        (bool success, ) = payable(masterAccount).call{value: msg.value}("");
        require(success, "Deposit Failed!");
        emit GasDeposit(_msgSender(), msg.value);
    }

    //Returns the balance of the address
    function balanceOf(address account) 
        public 
        view 
        returns(uint256) 
    {
        return balance[account];
    }

    //Withdraw any ERC20 tokens accidentally sent to our contract
    function recoverERC20(IERC20 _address) 
        external 
        onlyOperator 
    {
        uint256 amount = IERC20(_address).balanceOf(address(this));
        IERC20(_address).transfer(_msgSender(), amount);
    }

    //Withdraw any Matic accidentally sent to our contract
    function recoverMatic() 
        external
    {
        require(_msgSender() == masterAccount, "Permission denied!");
        (bool success, ) = payable(masterAccount).call{value: address(this).balance}("");
        require(success, "Withdraw Failed!");
    }

}