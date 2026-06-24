// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ArcanumMessenger {
    uint256 public constant PRIVATE_MESSAGE_FEE = 0.05 ether;
    uint256 public constant PUBLIC_MESSAGE_FEE = 0.01 ether;

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
    address public immutable treasury;

    event MessageSent(
        uint256 indexed id,
        address indexed sender,
        address indexed recipient,
        bool isPrivate,
        uint256 timestamp
    );

    event EncryptionKeyRegistered(address indexed account, string publicKey);

    event FeePaid(address indexed sender, uint256 indexed id, uint256 amount);

    constructor(address treasury_) {
        require(treasury_ != address(0), "TREASURY_REQUIRED");
        treasury = treasury_;
    }

    function registerEncryptionKey(string calldata publicKey) external {
        require(bytes(publicKey).length > 0, "PUBLIC_KEY_REQUIRED");
        encryptionKeys[msg.sender] = publicKey;
        emit EncryptionKeyRegistered(msg.sender, publicKey);
    }

    function sendMessage(address recipient, string calldata payload, bool isPrivate) external payable returns (uint256) {
        require(recipient != address(0), "RECIPIENT_REQUIRED");
        require(recipient != msg.sender, "CANNOT_MESSAGE_SELF");
        require(bytes(payload).length > 0, "PAYLOAD_REQUIRED");

        uint256 requiredFee = isPrivate ? PRIVATE_MESSAGE_FEE : PUBLIC_MESSAGE_FEE;
        require(msg.value == requiredFee, "INVALID_MESSAGE_FEE");

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
        emit FeePaid(msg.sender, id, msg.value);
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

    function withdrawFees() external {
        require(msg.sender == treasury, "TREASURY_ONLY");

        uint256 balance = address(this).balance;
        require(balance > 0, "NO_FEES");

        (bool sent, ) = treasury.call{value: balance}("");
        require(sent, "WITHDRAW_FAILED");
    }

    function _messagesFor(uint256[] storage ids) private view returns (Message[] memory) {
        Message[] memory result = new Message[](ids.length);

        for (uint256 i = 0; i < ids.length; i++) {
            result[i] = messages[ids[i]];
        }

        return result;
    }
}
