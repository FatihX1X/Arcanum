// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AuditReceiverHarness {
    address public target;
    bytes public reentry;
    bool public reject;
    bool public reentryBlocked;

    function execute(address destination, bytes calldata data) external payable {
        (bool ok, bytes memory reason) = destination.call{value: msg.value}(data);
        if (!ok) assembly { revert(add(reason, 32), mload(reason)) }
    }

    function configure(address destination, bytes calldata data, bool rejectPayment) external {
        target = destination;
        reentry = data;
        reject = rejectPayment;
    }

    receive() external payable {
        require(!reject, "REJECTED");
        (bool ok, ) = target.call(reentry);
        reentryBlocked = !ok;
    }
}
