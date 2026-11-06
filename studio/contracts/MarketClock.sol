// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IReceiver} from "./interfaces/IReceiver.sol";

/// @notice CRE-fed USD18 reference prices, ordered NVDA / AAPL / MSFT.
/// @dev Forwarders and the owner fallback are trusted price authorities. Reports may repeat;
///      timestamps represent receipt time, not authenticated exchange observation time.
contract MarketClock is Ownable, IReceiver {
    error UnauthorizedForwarder();
    error InvalidWorkflowMetadata();
    error UnexpectedWorkflowOwner();
    error InvalidPrices();
    error InvalidStock();

    /// @notice The stock tokens the three prices refer to, in [NVDA, AAPL, MSFT] order.
    address[3] public stocks;
    uint256[3] public priceUsd;
    uint256[3] public priceUpdatedAt;
    bool public marketOpen;
    uint256 public updatedAt;
    mapping(address => bool) public isForwarder;
    address public expectedWorkflowOwner;

    event ReportApplied(address indexed source, uint256[] prices, bool marketOpen);
    event ForwarderSet(address indexed forwarder, bool allowed);
    event ExpectedWorkflowOwnerSet(address indexed previousOwner, address indexed newOwner);

    constructor(address owner_, address[3] memory stocks_, address[] memory forwarders) Ownable(owner_) {
        for (uint256 i; i < 3; ++i) {
            if (stocks_[i] == address(0)) revert InvalidStock();
        }
        stocks = stocks_;
        for (uint256 i; i < forwarders.length; ++i) {
            isForwarder[forwarders[i]] = true;
            emit ForwarderSet(forwarders[i], true);
        }
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    function setForwarder(address forwarder, bool allowed) external onlyOwner {
        isForwarder[forwarder] = allowed;
        emit ForwarderSet(forwarder, allowed);
    }

    /// @notice Zero disables workflow-owner pinning; the forwarder allowlist always applies.
    function setExpectedWorkflowOwner(address workflowOwner) external onlyOwner {
        emit ExpectedWorkflowOwnerSet(expectedWorkflowOwner, workflowOwner);
        expectedWorkflowOwner = workflowOwner;
    }

    /// @inheritdoc IReceiver
    function onReport(bytes calldata metadata, bytes calldata report) external override {
        if (!isForwarder[msg.sender]) revert UnauthorizedForwarder();
        if (expectedWorkflowOwner != address(0)) {
            if (metadata.length < 62) revert InvalidWorkflowMetadata();
            address workflowOwner;
            // Packed metadata: bytes32 id | bytes10 name | address owner | bytes2 reportName.
            assembly ("memory-safe") {
                workflowOwner := shr(96, calldataload(add(metadata.offset, 42)))
            }
            if (workflowOwner != expectedWorkflowOwner) revert UnexpectedWorkflowOwner();
        }
        _apply(msg.sender, report);
    }

    /// @notice Trusted owner fallback, intentionally accepting duplicate reports for demos.
    function pushReport(bytes calldata report) external onlyOwner {
        _apply(msg.sender, report);
    }

    function _apply(address source, bytes calldata report) internal {
        (uint256[] memory prices, bool open) = abi.decode(report, (uint256[], bool));
        if (prices.length != 3) revert InvalidPrices();
        for (uint256 i; i < 3; ++i) {
            if (prices[i] == 0) revert InvalidPrices();
            priceUsd[i] = prices[i];
            priceUpdatedAt[i] = block.timestamp;
        }
        marketOpen = open;
        updatedAt = block.timestamp;
        emit ReportApplied(source, prices, open);
    }

    /// @notice Read the entire reference state in one call.
    function state() external view returns (
        uint256[3] memory prices, uint256[3] memory priceTimes, bool open, uint256 marketTime
    ) {
        return (priceUsd, priceUpdatedAt, marketOpen, updatedAt);
    }
}
