// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IReceiver} from "../interfaces/IReceiver.sol";
import {MarketClock} from "../MarketClock.sol";

contract MarketClockTest is Test {
    MarketClock internal clock;
    address internal owner = makeAddr("owner");
    address internal fwd = makeAddr("forwarder");
    address internal rando = makeAddr("rando");
    address internal wfOwner = makeAddr("workflowOwner");

    uint256 internal constant T0 = 1_700_000_000;

    address internal nvda = makeAddr("NVDA");
    address internal aapl = makeAddr("AAPL");
    address internal msft = makeAddr("MSFT");

    function _stocks() internal view returns (address[3] memory) {
        return [nvda, aapl, msft];
    }

    function setUp() public {
        vm.warp(T0);
        address[] memory f = new address[](1);
        f[0] = fwd;
        clock = new MarketClock(owner, _stocks(), f);
    }

    // --------------------------------------------------------- stocks

    function test_Stocks_GetterReturnsConstructorOrder() public view {
        assertEq(clock.stocks(0), nvda);
        assertEq(clock.stocks(1), aapl);
        assertEq(clock.stocks(2), msft);
    }

    function test_Constructor_ZeroStockRevertsInvalidStock_AnyPosition() public {
        address[] memory f = new address[](0);
        address[3] memory s = _stocks();
        for (uint256 i; i < 3; ++i) {
            address[3] memory bad = s;
            bad[i] = address(0);
            vm.expectRevert(MarketClock.InvalidStock.selector);
            new MarketClock(owner, bad, f);
        }
        address[3] memory allZero;
        vm.expectRevert(MarketClock.InvalidStock.selector);
        new MarketClock(owner, allZero, f);
    }

    function test_Stocks_AreUnaffectedByReportsAndOwnerActions() public {
        vm.startPrank(owner);
        clock.pushReport(_report(1, 2, 3, true));
        clock.setForwarder(rando, true);
        clock.setExpectedWorkflowOwner(wfOwner);
        vm.stopPrank();
        assertEq(clock.stocks(0), nvda);
        assertEq(clock.stocks(1), aapl);
        assertEq(clock.stocks(2), msft);
    }

    function _prices(uint256 a, uint256 b, uint256 c) internal pure returns (uint256[] memory p) {
        p = new uint256[](3);
        p[0] = a;
        p[1] = b;
        p[2] = c;
    }

    function _report(uint256 a, uint256 b, uint256 c, bool open) internal pure returns (bytes memory) {
        return abi.encode(_prices(a, b, c), open);
    }

    function _meta(address wf) internal pure returns (bytes memory) {
        return abi.encodePacked(bytes32(uint256(1)), bytes10(0), wf, bytes2(0));
    }

    // ------------------------------------------------------- construction

    function test_Constructor_SetsOwnerAndForwarders() public {
        assertEq(clock.owner(), owner);
        assertTrue(clock.isForwarder(fwd));
        assertFalse(clock.isForwarder(rando));
        assertFalse(clock.marketOpen());
        assertEq(clock.expectedWorkflowOwner(), address(0));

        address[] memory f = new address[](2);
        f[0] = rando;
        f[1] = wfOwner;
        vm.expectEmit(true, false, false, true);
        emit MarketClock.ForwarderSet(rando, true);
        vm.expectEmit(true, false, false, true);
        emit MarketClock.ForwarderSet(wfOwner, true);
        MarketClock c2 = new MarketClock(owner, _stocks(), f);
        assertTrue(c2.isForwarder(rando));
        assertTrue(c2.isForwarder(wfOwner));
    }

    // ---------------------------------------------------------- onReport

    function test_OnReport_FromForwarder_AppliesAndEmits() public {
        uint256[] memory p = _prices(200e18, 250e18, 500e18);
        vm.expectEmit(true, false, false, true, address(clock));
        emit MarketClock.ReportApplied(fwd, p, true);
        vm.prank(fwd);
        clock.onReport("", abi.encode(p, true));

        assertEq(clock.priceUsd(0), 200e18);
        assertEq(clock.priceUsd(1), 250e18);
        assertEq(clock.priceUsd(2), 500e18);
        for (uint256 i; i < 3; ++i) assertEq(clock.priceUpdatedAt(i), T0);
        assertTrue(clock.marketOpen());
        assertEq(clock.updatedAt(), T0);

        (uint256[3] memory pr, uint256[3] memory ts, bool open, uint256 mt) = clock.state();
        assertEq(pr[0], 200e18);
        assertEq(pr[2], 500e18);
        assertEq(ts[1], T0);
        assertTrue(open);
        assertEq(mt, T0);
    }

    function test_OnReport_RejectsRandomAddress() public {
        vm.prank(rando);
        vm.expectRevert(MarketClock.UnauthorizedForwarder.selector);
        clock.onReport("", _report(1, 2, 3, true));
    }

    function test_OnReport_RejectsOwner_OwnerMustUsePushReport() public {
        vm.prank(owner);
        vm.expectRevert(MarketClock.UnauthorizedForwarder.selector);
        clock.onReport("", _report(1, 2, 3, true));
    }

    function test_OnReport_RejectsRemovedForwarder() public {
        vm.prank(owner);
        clock.setForwarder(fwd, false);
        vm.prank(fwd);
        vm.expectRevert(MarketClock.UnauthorizedForwarder.selector);
        clock.onReport("", _report(1, 2, 3, true));
    }

    function test_OnReport_InvalidPricesRevert() public {
        vm.startPrank(fwd);
        vm.expectRevert(MarketClock.InvalidPrices.selector);
        clock.onReport("", _report(0, 2, 3, true));
        vm.expectRevert(MarketClock.InvalidPrices.selector);
        clock.onReport("", _report(1, 0, 3, true));
        vm.expectRevert(MarketClock.InvalidPrices.selector);
        clock.onReport("", _report(1, 2, 0, true));
        uint256[] memory two = new uint256[](2);
        two[0] = 1;
        two[1] = 2;
        vm.expectRevert(MarketClock.InvalidPrices.selector);
        clock.onReport("", abi.encode(two, true));
        uint256[] memory four = new uint256[](4);
        for (uint256 i; i < 4; ++i) four[i] = 1;
        vm.expectRevert(MarketClock.InvalidPrices.selector);
        clock.onReport("", abi.encode(four, true));
        vm.stopPrank();
        assertEq(clock.updatedAt(), 0, "failed reports leave no state");
    }

    // --------------------------------------------------------- pushReport

    function test_PushReport_OwnerAppliesAndMayReplay() public {
        uint256[] memory p = _prices(200e18, 250e18, 500e18);
        vm.expectEmit(true, false, false, true, address(clock));
        emit MarketClock.ReportApplied(owner, p, true);
        vm.prank(owner);
        clock.pushReport(abi.encode(p, true));
        assertTrue(clock.marketOpen());

        vm.warp(T0 + 100);
        vm.prank(owner);
        clock.pushReport(abi.encode(p, true)); // replaying marketOpen=true / identical prices is fine
        assertEq(clock.updatedAt(), T0 + 100);
        assertEq(clock.priceUpdatedAt(0), T0 + 100, "timestamps refresh on replay");

        vm.prank(owner);
        clock.pushReport(_report(201e18, 251e18, 501e18, false));
        assertFalse(clock.marketOpen());
        assertEq(clock.priceUsd(2), 501e18);
    }

    function test_PushReport_OnlyOwner() public {
        vm.prank(rando);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, rando));
        clock.pushReport(_report(1, 2, 3, true));
        vm.prank(fwd); // even an allowlisted forwarder cannot use the owner fallback
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, fwd));
        clock.pushReport(_report(1, 2, 3, true));
    }

    function test_PushReport_InvalidPricesRevert() public {
        vm.startPrank(owner);
        vm.expectRevert(MarketClock.InvalidPrices.selector);
        clock.pushReport(_report(0, 2, 3, true));
        vm.expectRevert(MarketClock.InvalidPrices.selector);
        clock.pushReport(_report(1, 2, 0, true));
        uint256[] memory two = new uint256[](2);
        two[0] = 1;
        two[1] = 2;
        vm.expectRevert(MarketClock.InvalidPrices.selector);
        clock.pushReport(abi.encode(two, false));
        vm.stopPrank();
    }

    // -------------------------------------------------------- ERC-165

    function test_SupportsInterface() public view {
        assertTrue(clock.supportsInterface(type(IReceiver).interfaceId));
        assertTrue(clock.supportsInterface(type(IERC165).interfaceId));
        assertFalse(clock.supportsInterface(0xffffffff));
        assertFalse(clock.supportsInterface(0x12345678));
    }

    // ----------------------------------------- workflow-owner pinning

    function test_WorkflowOwner_SetEmitsAndIsOwnerOnly() public {
        vm.prank(rando);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, rando));
        clock.setExpectedWorkflowOwner(wfOwner);

        vm.expectEmit(true, true, false, false, address(clock));
        emit MarketClock.ExpectedWorkflowOwnerSet(address(0), wfOwner);
        vm.prank(owner);
        clock.setExpectedWorkflowOwner(wfOwner);
        assertEq(clock.expectedWorkflowOwner(), wfOwner);
    }

    function test_WorkflowOwner_MatchingMetadataPasses() public {
        vm.prank(owner);
        clock.setExpectedWorkflowOwner(wfOwner);
        vm.prank(fwd);
        clock.onReport(_meta(wfOwner), _report(200e18, 250e18, 500e18, true));
        assertEq(clock.priceUsd(0), 200e18);

        // Longer-than-minimum metadata is accepted too.
        vm.prank(fwd);
        clock.onReport(abi.encodePacked(_meta(wfOwner), hex"deadbeef"), _report(201e18, 250e18, 500e18, true));
        assertEq(clock.priceUsd(0), 201e18);
    }

    function test_WorkflowOwner_MismatchRevertsEvenFromForwarder() public {
        vm.prank(owner);
        clock.setExpectedWorkflowOwner(wfOwner);
        vm.prank(fwd);
        vm.expectRevert(MarketClock.UnexpectedWorkflowOwner.selector);
        clock.onReport(_meta(rando), _report(1, 2, 3, true));
        // Owner address placed at the wrong offset (inside the 32-byte workflow id) does not count.
        vm.prank(fwd);
        vm.expectRevert(MarketClock.UnexpectedWorkflowOwner.selector);
        clock.onReport(abi.encodePacked(bytes32(uint256(uint160(wfOwner))), bytes10(0), address(0), bytes2(0)), _report(1, 2, 3, true));
    }

    function test_WorkflowOwner_ShortMetadataReverts() public {
        vm.prank(owner);
        clock.setExpectedWorkflowOwner(wfOwner);
        bytes memory m = _meta(wfOwner);
        assertEq(m.length, 64);
        bytes memory short = new bytes(61);
        for (uint256 i; i < 61; ++i) short[i] = m[i];
        vm.prank(fwd);
        vm.expectRevert(MarketClock.InvalidWorkflowMetadata.selector);
        clock.onReport(short, _report(1, 2, 3, true));
        vm.prank(fwd);
        vm.expectRevert(MarketClock.InvalidWorkflowMetadata.selector);
        clock.onReport("", _report(1, 2, 3, true));
    }

    function test_WorkflowOwner_ExactlyMinimumLengthPasses() public {
        // Layout: id(32) | name(10) | owner(20) | reportName(2) = 64 bytes; shr(96, load@42) needs 62 bytes.
        vm.prank(owner);
        clock.setExpectedWorkflowOwner(wfOwner);
        bytes memory m = _meta(wfOwner);
        bytes memory min = new bytes(62);
        for (uint256 i; i < 62; ++i) min[i] = m[i];
        vm.prank(fwd);
        clock.onReport(min, _report(5e18, 6e18, 7e18, false));
        assertEq(clock.priceUsd(1), 6e18);
    }

    function test_WorkflowOwner_UnsetDisablesCheck() public {
        vm.startPrank(owner);
        clock.setExpectedWorkflowOwner(wfOwner);
        clock.setExpectedWorkflowOwner(address(0));
        vm.stopPrank();
        vm.prank(fwd);
        clock.onReport("", _report(1, 2, 3, true)); // empty metadata is fine again
        vm.prank(fwd);
        clock.onReport(_meta(rando), _report(4, 5, 6, true));
        assertEq(clock.priceUsd(0), 4);
    }

    function test_WorkflowOwner_PinningDoesNotAffectOwnerPushReport() public {
        vm.startPrank(owner);
        clock.setExpectedWorkflowOwner(wfOwner);
        clock.pushReport(_report(1, 2, 3, true));
        vm.stopPrank();
        assertEq(clock.priceUsd(2), 3);
    }

    // ---------------------------------------------------------- forwarders

    function test_SetForwarder_OnlyOwnerAndEmits() public {
        vm.prank(rando);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, rando));
        clock.setForwarder(rando, true);

        vm.expectEmit(true, false, false, true, address(clock));
        emit MarketClock.ForwarderSet(rando, true);
        vm.prank(owner);
        clock.setForwarder(rando, true);
        vm.prank(rando);
        clock.onReport("", _report(1, 2, 3, true));
        assertEq(clock.priceUsd(1), 2);
    }

    function testFuzz_OnReport_StoresAnyNonZeroPrices(uint256 a, uint256 b, uint256 c, bool open) public {
        a = bound(a, 1, type(uint128).max);
        b = bound(b, 1, type(uint128).max);
        c = bound(c, 1, type(uint128).max);
        vm.prank(fwd);
        clock.onReport("", _report(a, b, c, open));
        assertEq(clock.priceUsd(0), a);
        assertEq(clock.priceUsd(1), b);
        assertEq(clock.priceUsd(2), c);
        assertEq(clock.marketOpen(), open);
    }
}
