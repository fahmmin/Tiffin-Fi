// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MockStock} from "../MockStock.sol";

contract MockStockTest is Test {
    MockStock internal stock;
    address internal minter = makeAddr("minter");
    address internal rando = makeAddr("rando");
    address internal alice = makeAddr("alice");

    function setUp() public {
        stock = new MockStock("tNVDA", "tNVDA", minter);
    }

    function test_Minter_IsTheOwnerAndCanMint() public {
        assertEq(stock.owner(), minter);
        vm.expectEmit(true, true, false, true, address(stock));
        emit IERC20.Transfer(address(0), alice, 5e18);
        vm.prank(minter);
        stock.mint(alice, 5e18);
        assertEq(stock.balanceOf(alice), 5e18);
        assertEq(stock.totalSupply(), 5e18);
        assertEq(stock.decimals(), 18);
    }

    function test_NonOwnerCannotMint_NotEvenToSelf() public {
        vm.prank(rando);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, rando));
        stock.mint(rando, 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        stock.mint(alice, 1);
        assertEq(stock.totalSupply(), 0);
    }

    function test_ApprovedSpenderAndHolderCannotMint() public {
        vm.prank(minter);
        stock.mint(alice, 10e18);
        vm.prank(alice);
        stock.approve(rando, type(uint256).max);
        vm.prank(rando);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, rando));
        stock.mint(rando, 1e18);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        stock.mint(alice, 1e18);
        assertEq(stock.totalSupply(), 10e18);
    }

    function test_OwnershipTransfer_MovesTheMintRightExclusively() public {
        vm.prank(rando);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, rando));
        stock.transferOwnership(rando); // only the owner can hand over minting

        vm.prank(minter);
        stock.transferOwnership(rando);
        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, minter));
        stock.mint(alice, 1);
        vm.prank(rando);
        stock.mint(alice, 1);
        assertEq(stock.balanceOf(alice), 1);
    }

    function test_RenouncedOwnership_FreezesSupply() public {
        vm.prank(minter);
        stock.mint(alice, 1e18);
        vm.prank(minter);
        stock.renounceOwnership();
        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, minter));
        stock.mint(alice, 1);
        assertEq(stock.totalSupply(), 1e18);
    }

    function test_Constructor_ZeroOwnerReverts() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new MockStock("x", "x", address(0));
    }

    function testFuzz_OnlyTheOwnerMints(address caller, address to, uint256 amount) public {
        vm.assume(caller != minter && to != address(0));
        amount = bound(amount, 1, type(uint128).max);
        vm.prank(caller);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, caller));
        stock.mint(to, amount);
        assertEq(stock.totalSupply(), 0);

        vm.prank(minter);
        stock.mint(to, amount);
        assertEq(stock.balanceOf(to), amount);
        assertEq(stock.totalSupply(), amount);
    }
}
