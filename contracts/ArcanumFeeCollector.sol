// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

abstract contract ArcanumFeeCollector is ReentrancyGuard {
    address public constant FEE_CLAIM_WALLET = 0x3406584CCD8cc2fa38BfD3ece96d5dD4371B0040;

    event FeePaid(address indexed payer, uint256 indexed operationId, uint256 amount);
    event FeesClaimed(address indexed claimer, uint256 amount);

    modifier onlyFeeClaimer() {
        require(msg.sender == FEE_CLAIM_WALLET, "FEE_CLAIM_NOT_ALLOWED");
        _;
    }

    function claimFees() external onlyFeeClaimer nonReentrant {
        uint256 balance = address(this).balance;
        require(balance > 0, "NO_FEES");

        (bool sent, ) = msg.sender.call{value: balance}("");
        require(sent, "CLAIM_FAILED");

        emit FeesClaimed(msg.sender, balance);
    }

    function _recordFee(uint256 operationId, uint256 amount) internal {
        emit FeePaid(msg.sender, operationId, amount);
    }
}
