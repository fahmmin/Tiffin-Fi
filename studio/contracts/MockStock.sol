// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Centrally issued, 18-decimal demo stock; not a claim on real securities.
/// @dev Only the designated owner can issue supply. Ownership is transferable via Ownable.
contract MockStock is ERC20, Ownable {
    constructor(string memory name_, string memory symbol_, address owner_)
        ERC20(name_, symbol_) Ownable(owner_)
    {}

    /// @notice Issue demo stock to an account.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
