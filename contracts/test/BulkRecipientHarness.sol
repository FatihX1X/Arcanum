// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract BulkRecipientHarness {
    bool public rejectTransfers;

    function setRejectTransfers(bool reject) external {
        rejectTransfers = reject;
    }

    receive() external payable {
        require(!rejectTransfers, "TRANSFER_REJECTED");
    }
}
