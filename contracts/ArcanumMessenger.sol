// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ArcanumMessenger {
    struct Message {
        uint256 id;
        address sender;
        address recipient;
        string payload;
        bool isPrivate;
        uint256 timestamp;
    }

    Message[] private messages;
    mapping(address => uint256[]) private inbox;
    mapping(address => uint256[]) private outbox;
    mapping(address => string) public encryptionKeys;

    event MessageSent(
        uint256 indexed id,
        address indexed sender,
        address indexed recipient,
        bool isPrivate,
        uint256 timestamp
    );

    event EncryptionKeyRegistered(address indexed account, string publicKey);

    function registerEncryptionKey(string calldata publicKey) external {
        require(bytes(publicKey).length > 0, "PUBLIC_KEY_REQUIRED");
        encryptionKeys[msg.sender] = publicKey;
        emit EncryptionKeyRegistered(msg.sender, publicKey);
    }

    function sendMessage(address recipient, string calldata payload, bool isPrivate) external returns (uint256) {
        require(recipient != address(0), "RECIPIENT_REQUIRED");
        require(recipient != msg.sender, "CANNOT_MESSAGE_SELF");
        require(bytes(payload).length > 0, "PAYLOAD_REQUIRED");

        uint256 id = messages.length;
        Message memory newMessage = Message({
            id: id,
            sender: msg.sender,
            recipient: recipient,
            payload: payload,
            isPrivate: isPrivate,
            timestamp: block.timestamp
        });

        messages.push(newMessage);
        inbox[recipient].push(id);
        outbox[msg.sender].push(id);

        emit MessageSent(id, msg.sender, recipient, isPrivate, block.timestamp);
        return id;
    }

    function getInbox(address account) external view returns (Message[] memory) {
        return _messagesFor(inbox[account]);
    }

    function getOutbox(address account) external view returns (Message[] memory) {
        return _messagesFor(outbox[account]);
    }

    function messageCount() external view returns (uint256) {
        return messages.length;
    }

    function _messagesFor(uint256[] storage ids) private view returns (Message[] memory) {
        Message[] memory result = new Message[](ids.length);

        for (uint256 i = 0; i < ids.length; i++) {
            result[i] = messages[ids[i]];
        }

        return result;
    }
}
