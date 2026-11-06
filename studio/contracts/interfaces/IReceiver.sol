// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/// @notice Chainlink-compatible report receiver interface.
interface IReceiver is IERC165 {
    /// @notice Receive authenticated workflow metadata and an ABI-encoded report.
    function onReport(bytes calldata metadata, bytes calldata report) external;
}
