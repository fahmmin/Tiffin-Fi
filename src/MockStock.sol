// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "solmate/src/tokens/ERC20.sol";

/// @title MockStock
/// @notice Testnet stand-in for a tokenized share (no value). Only the deployer can mint, so nobody can mint
/// shares for free and sell them into the fund for its USDC.
contract MockStock is ERC20 {
    address public immutable minter;

    error NotMinter();

    constructor(string memory name_, string memory symbol_, address minter_) ERC20(name_, symbol_, 18) {
        minter = minter_;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != minter) revert NotMinter();
        _mint(to, amount);
    }
}
