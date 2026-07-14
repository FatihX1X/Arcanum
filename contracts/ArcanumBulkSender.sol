// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ArcanumBulkSender {
    uint256 public constant MAX_RECIPIENTS = 100;
    uint256 public batchCount;
    bool private locked;

    event BatchSent(uint256 indexed batchId, address indexed sender, uint256 recipientCount, uint256 totalAmount);
    event TransferSent(uint256 indexed batchId, uint256 indexed index, address indexed recipient, uint256 amount);

    modifier nonReentrant() {
        require(!locked, "REENTRANT_CALL");
        locked = true;
        _;
        locked = false;
    }

    function batchSend(
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external payable nonReentrant returns (uint256) {
        require(recipients.length > 0, "RECIPIENTS_REQUIRED");
        require(recipients.length <= MAX_RECIPIENTS, "TOO_MANY_RECIPIENTS");
        require(recipients.length == amounts.length, "ARRAY_LENGTH_MISMATCH");

        uint256 totalAmount;
        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "RECIPIENT_REQUIRED");
            require(amounts[i] > 0, "AMOUNT_REQUIRED");
            totalAmount += amounts[i];
        }
        require(msg.value == totalAmount, "INVALID_TOTAL_VALUE");

        uint256 batchId = batchCount;
        batchCount = batchId + 1;

        for (uint256 i = 0; i < recipients.length; i++) {
            (bool sent, ) = recipients[i].call{value: amounts[i]}("");
            require(sent, "TRANSFER_FAILED");
            emit TransferSent(batchId, i, recipients[i], amounts[i]);
        }

        emit BatchSent(batchId, msg.sender, recipients.length, totalAmount);
        return batchId;
    }
}
