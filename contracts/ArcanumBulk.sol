// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ArcanumFeeCollector} from "./ArcanumFeeCollector.sol";

contract ArcanumBulk is ArcanumFeeCollector {
    using SafeERC20 for IERC20;

    uint256 public constant BULK_BATCH_FEE = 0.05 ether;
    uint256 public constant MAX_RECIPIENTS = 100;
    uint256 public constant MAX_MESSAGE_BYTES = 4096;
    uint256 public constant MAX_PAGE_SIZE = 100;

    struct BulkBatch {
        uint256 id;
        address sender;
        uint256 totalAmount;
        uint256 recipientCount;
        string message;
        uint256 timestamp;
    }

    struct BulkTransfer {
        address recipient;
        uint256 amount;
    }

    IERC20 public immutable usdc;
    uint256 public batchCount;

    mapping(uint256 => BulkBatch) private batches;
    mapping(uint256 => BulkTransfer[]) private transfersByBatch;
    mapping(address => uint256[]) private sentBatchIds;
    mapping(address => uint256[]) private receivedBatchIds;

    event BulkBatchSent(
        uint256 indexed batchId,
        address indexed sender,
        uint256 recipientCount,
        uint256 totalAmount,
        string message,
        uint256 timestamp
    );
    event BulkTransferSent(uint256 indexed batchId, address indexed sender, address indexed recipient, uint256 amount);

    constructor(address usdcAddress) {
        require(usdcAddress != address(0), "USDC_REQUIRED");
        usdc = IERC20(usdcAddress);
    }

    function bulkSend(
        address[] calldata recipients,
        uint256[] calldata amounts,
        string calldata message
    ) external payable nonReentrant returns (uint256 batchId) {
        uint256 recipientCount = recipients.length;
        require(recipientCount > 0, "RECIPIENTS_REQUIRED");
        require(recipientCount <= MAX_RECIPIENTS, "TOO_MANY_RECIPIENTS");
        require(recipientCount == amounts.length, "ARRAY_LENGTH_MISMATCH");
        require(bytes(message).length > 0, "MESSAGE_REQUIRED");
        require(bytes(message).length <= MAX_MESSAGE_BYTES, "MESSAGE_TOO_LARGE");
        require(msg.value == BULK_BATCH_FEE, "INVALID_BULK_BATCH_FEE");

        uint256 totalAmount;
        address previousRecipient = address(0);
        for (uint256 i = 0; i < recipientCount; i++) {
            address recipient = recipients[i];
            require(recipient != address(0), "RECIPIENT_REQUIRED");
            require(recipient != msg.sender, "CANNOT_SEND_TO_SELF");
            require(uint160(recipient) > uint160(previousRecipient), "RECIPIENTS_NOT_SORTED_UNIQUE");
            require(amounts[i] > 0, "AMOUNT_REQUIRED");
            previousRecipient = recipient;
            totalAmount += amounts[i];
        }

        batchId = batchCount;
        batchCount += 1;
        batches[batchId] = BulkBatch({
            id: batchId,
            sender: msg.sender,
            totalAmount: totalAmount,
            recipientCount: recipientCount,
            message: message,
            timestamp: block.timestamp
        });
        sentBatchIds[msg.sender].push(batchId);

        for (uint256 i = 0; i < recipientCount; i++) {
            address recipient = recipients[i];
            uint256 amount = amounts[i];

            usdc.safeTransferFrom(msg.sender, recipient, amount);
            transfersByBatch[batchId].push(BulkTransfer({recipient: recipient, amount: amount}));
            receivedBatchIds[recipient].push(batchId);
            emit BulkTransferSent(batchId, msg.sender, recipient, amount);
        }

        _recordFee(batchId, msg.value);
        emit BulkBatchSent(batchId, msg.sender, recipientCount, totalAmount, message, block.timestamp);
    }

    function getBatch(uint256 batchId) external view returns (BulkBatch memory) {
        require(batchId < batchCount, "BATCH_NOT_FOUND");
        return batches[batchId];
    }

    function getBatchTransferCount(uint256 batchId) external view returns (uint256) {
        require(batchId < batchCount, "BATCH_NOT_FOUND");
        return transfersByBatch[batchId].length;
    }

    function getBatchTransfersPage(uint256 batchId, uint256 offset, uint256 limit) external view returns (BulkTransfer[] memory) {
        require(batchId < batchCount, "BATCH_NOT_FOUND");
        require(limit <= MAX_PAGE_SIZE, "PAGE_TOO_LARGE");
        BulkTransfer[] storage values = transfersByBatch[batchId];

        if (offset >= values.length || limit == 0) {
            return new BulkTransfer[](0);
        }

        uint256 end = offset + limit;
        if (end > values.length) {
            end = values.length;
        }

        BulkTransfer[] memory result = new BulkTransfer[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = values[i];
        }
        return result;
    }

    function getSentBatchCount(address account) external view returns (uint256) {
        return sentBatchIds[account].length;
    }

    function getReceivedBatchCount(address account) external view returns (uint256) {
        return receivedBatchIds[account].length;
    }

    function getSentBatchIdsPage(address account, uint256 offset, uint256 limit) external view returns (uint256[] memory) {
        return _uintPage(sentBatchIds[account], offset, limit);
    }

    function getReceivedBatchIdsPage(address account, uint256 offset, uint256 limit) external view returns (uint256[] memory) {
        return _uintPage(receivedBatchIds[account], offset, limit);
    }

    function _uintPage(uint256[] storage values, uint256 offset, uint256 limit) private view returns (uint256[] memory) {
        require(limit <= MAX_PAGE_SIZE, "PAGE_TOO_LARGE");
        if (offset >= values.length || limit == 0) {
            return new uint256[](0);
        }

        uint256 end = offset + limit;
        if (end > values.length) {
            end = values.length;
        }

        uint256[] memory result = new uint256[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = values[i];
        }
        return result;
    }
}
