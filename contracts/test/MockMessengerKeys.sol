// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockMessengerKeys {
    mapping(address => string) public encryptionKeys;

    function setEncryptionKey(address account, string calldata publicKey) external {
        encryptionKeys[account] = publicKey;
    }
}
