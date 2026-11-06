// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {ERC20} from "solmate/src/tokens/ERC20.sol";

/// Prints the deployer address and its Arc USDC balances, without broadcasting anything.
contract WhoAmI is Script {
    address constant USDC = 0x3600000000000000000000000000000000000000;

    function run() external view {
        address me = vm.addr(vm.envUint("PRIVATE_KEY"));
        console2.log("deployer", me);
        console2.log("native USDC balance (18 decimals)", me.balance);
        console2.log("USDC ERC-20 balance (6 decimals)", ERC20(USDC).balanceOf(me));
    }
}
