// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Chainlink CRE delivers workflow reports to receiver contracts through its forwarder.
interface IReceiver {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

/// @title MarketClock
/// @notice The basket's view of Wall Street: a reference price per stock and whether the market is open.
/// A Chainlink CRE workflow writes reports through the forwarder. The owner can push the same report as a
/// fallback and to replay a Monday open in demos.
/// @dev Report format: abi.encode(uint256[] prices, bool marketOpen), prices in USD per whole share, 18 decimals,
/// in the order of `stocks()`.
contract MarketClock is IReceiver, IERC165 {
    struct Quote {
        uint128 price;
        uint64 updatedAt;
    }

    address public owner;
    address[] internal _stocks;
    mapping(address stock => Quote) internal _quotes;
    bool public marketOpen;
    uint64 public statusUpdatedAt;
    mapping(address forwarder => bool) public isForwarder;

    event ReportApplied(address indexed source, uint256[] prices, bool marketOpen);
    event ForwarderSet(address indexed forwarder, bool allowed);
    event OwnerChanged(address indexed owner);

    error NotOwner();
    error NotForwarder();
    error BadReport();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address owner_, address[] memory stocks_, address[] memory forwarders) {
        owner = owner_;
        _stocks = stocks_;
        for (uint256 i; i < forwarders.length; ++i) {
            isForwarder[forwarders[i]] = true;
            emit ForwarderSet(forwarders[i], true);
        }
    }

    /// @inheritdoc IReceiver
    function onReport(bytes calldata, bytes calldata report) external {
        if (!isForwarder[msg.sender]) revert NotForwarder();
        _apply(report);
    }

    /// @notice Same report format as onReport, for the owner: a fallback, and the Monday replay in demos.
    function push(bytes calldata report) external onlyOwner {
        _apply(report);
    }

    function _apply(bytes calldata report) internal {
        (uint256[] memory prices, bool open) = abi.decode(report, (uint256[], bool));
        uint256 n = _stocks.length;
        if (prices.length != n) revert BadReport();
        for (uint256 i; i < n; ++i) {
            if (prices[i] == 0 || prices[i] > type(uint128).max) revert BadReport();
            _quotes[_stocks[i]] = Quote(uint128(prices[i]), uint64(block.timestamp));
        }
        marketOpen = open;
        statusUpdatedAt = uint64(block.timestamp);
        emit ReportApplied(msg.sender, prices, open);
    }

    function priceOf(address stock) external view returns (uint256 price, uint256 updatedAt) {
        Quote memory q = _quotes[stock];
        return (q.price, q.updatedAt);
    }

    function stocks() external view returns (address[] memory) {
        return _stocks;
    }

    function setForwarder(address forwarder, bool allowed) external onlyOwner {
        isForwarder[forwarder] = allowed;
        emit ForwarderSet(forwarder, allowed);
    }

    function setOwner(address owner_) external onlyOwner {
        owner = owner_;
        emit OwnerChanged(owner_);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
