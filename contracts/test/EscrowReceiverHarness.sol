// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IGigBoardHarness {
    function startConversation(uint256 gigId, string calldata encryptedInitialMessage) external returns (uint256);
    function proposeTerms(
        uint256 conversationId,
        uint256 amount,
        uint8 timeoutDays,
        address arbiter,
        bytes32 termsHash,
        string calldata encryptedNote
    ) external returns (uint256);
}

contract EscrowReceiverHarness {
    address public escrow;
    uint256 public escrowId;
    bool public rejectPayment;
    bool public attemptReentry;
    bool public reentryBlocked;

    function respondAndPropose(
        address board,
        uint256 gigId,
        uint256 amount,
        address arbiter,
        bytes32 termsHash
    ) external {
        uint256 conversationId = IGigBoardHarness(board).startConversation(gigId, "encrypted-harness-hello");
        IGigBoardHarness(board).proposeTerms(
            conversationId,
            amount,
            7,
            arbiter,
            termsHash,
            "encrypted-harness-proposal"
        );
    }

    function configureReceiver(address escrowAddress, uint256 targetEscrowId, bool reject, bool reenter) external {
        escrow = escrowAddress;
        escrowId = targetEscrowId;
        rejectPayment = reject;
        attemptReentry = reenter;
        reentryBlocked = false;
    }

    receive() external payable {
        if (rejectPayment) revert("PAYMENT_REJECTED");
        if (attemptReentry) {
            (bool success, ) = escrow.call(abi.encodeWithSignature("refund(uint256)", escrowId));
            reentryBlocked = !success;
        }
    }
}
