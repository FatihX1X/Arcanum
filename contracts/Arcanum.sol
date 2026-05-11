// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract Arcanum {
    struct Message {
        address sender;
        address receiver;
        bytes ciphertext;      // Şifreli mesaj içeriği
        uint256 timestamp;
        uint256 nonce;         // Replay attack koruması
    }

    // Her kullanıcının public key'i (X25519)
    mapping(address => bytes) public userPubkeys;

    // Tüm mesajlar (herkes okuyabilir ama sadece ciphertext)
    Message[] public allMessages;

    // Kullanıcının aldığı mesajların indexleri
    mapping(address => uint256[]) public userInbox;

    event MessageSent(
        uint256 indexed messageId,
        address indexed sender,
        address indexed receiver,
        uint256 timestamp
    );

    event PubkeyRegistered(address indexed user);

    // ====================== PUBKEY ======================
    function registerPubkey(bytes calldata pubkey) external {
        require(pubkey.length == 32, "Pubkey must be 32 bytes (X25519)");
        userPubkeys[msg.sender] = pubkey;
        emit PubkeyRegistered(msg.sender);
    }

    // ====================== MESAJ GÖNDER ======================
    function sendMessage(
        address receiver,
        bytes calldata ciphertext,
        uint256 nonce
    ) external {
        require(receiver != address(0), "Invalid receiver");
        require(ciphertext.length > 0, "Empty message");

        uint256 messageId = allMessages.length;

        allMessages.push(Message({
            sender: msg.sender,
            receiver: receiver,
            ciphertext: ciphertext,
            timestamp: block.timestamp,
            nonce: nonce
        }));

        userInbox[receiver].push(messageId);

        emit MessageSent(messageId, msg.sender, receiver, block.timestamp);
    }

    // ====================== OKUMA ======================
    function getMyMessages() external view returns (Message[] memory) {
        uint256[] memory inbox = userInbox[msg.sender];
        Message[] memory messages = new Message[](inbox.length);

        for (uint i = 0; i < inbox.length; i++) {
            messages[i] = allMessages[inbox[i]];
        }
        return messages;
    }

    function getMessage(uint256 messageId) external view returns (Message memory) {
        require(messageId < allMessages.length, "Message not found");
        return allMessages[messageId];
    }

    // Toplam mesaj sayısı
    function totalMessages() external view returns (uint256) {
        return allMessages.length;
    }
}