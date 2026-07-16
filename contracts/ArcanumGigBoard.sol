// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ArcanumGigBoard {
    uint256 public constant MAX_TITLE_BYTES = 120;
    uint256 public constant MAX_DESCRIPTION_BYTES = 2048;
    uint256 public constant MAX_PAYLOAD_BYTES = 4096;
    uint256 public constant MAX_PAGE_SIZE = 100;

    enum ListingType { WorkRequest, ServiceOffer }
    enum Category { Development, Design, Marketing, Testing, Other }
    enum GigStatus { Open, Funded, Closed, Cancelled }
    enum ProposalStatus { Pending, Accepted, Withdrawn, Superseded, Funded }
    enum MessageKind { Text, Proposal }

    struct Gig {
        uint256 id;
        address creator;
        ListingType listingType;
        Category category;
        string title;
        string description;
        uint256 suggestedBudget;
        uint64 createdAt;
        GigStatus status;
        uint256 awardedEscrowId;
    }

    struct Conversation {
        uint256 id;
        uint256 gigId;
        address creator;
        address counterparty;
        uint64 createdAt;
        uint256 messageCount;
        uint256 activeProposalId;
        bool hasActiveProposal;
    }

    struct ChatMessage {
        uint256 id;
        uint256 conversationId;
        address sender;
        string payload;
        MessageKind kind;
        uint256 proposalId;
        uint64 timestamp;
    }

    struct Proposal {
        uint256 id;
        uint256 conversationId;
        address proposer;
        address payer;
        address provider;
        address arbiter;
        uint256 amount;
        uint8 timeoutDays;
        bytes32 termsHash;
        uint64 createdAt;
        ProposalStatus status;
        uint256 escrowId;
    }

    address public immutable CONFIGURATOR;
    address public escrowContract;

    Gig[] private gigs;
    Conversation[] private conversations;
    Proposal[] private proposals;
    mapping(uint256 => ChatMessage[]) private conversationMessages;
    mapping(uint256 => uint256[]) private conversationProposals;
    mapping(uint256 => mapping(address => uint256)) private conversationIdPlusOne;
    mapping(address => uint256[]) private userConversations;

    event EscrowContractConfigured(address indexed escrowContract);
    event GigCreated(
        uint256 indexed gigId,
        address indexed creator,
        ListingType indexed listingType,
        Category category,
        uint256 suggestedBudget
    );
    event GigCancelled(uint256 indexed gigId, address indexed creator);
    event GigFunded(uint256 indexed gigId, uint256 indexed proposalId, uint256 indexed escrowId);
    event GigClosed(uint256 indexed gigId, uint256 indexed escrowId, uint8 finalEscrowStatus);
    event ConversationStarted(
        uint256 indexed conversationId,
        uint256 indexed gigId,
        address indexed counterparty,
        address creator
    );
    event ChatMessageSent(
        uint256 indexed conversationId,
        uint256 indexed messageId,
        address indexed sender,
        MessageKind kind,
        uint256 proposalId,
        uint64 timestamp
    );
    event ProposalCreated(
        uint256 indexed proposalId,
        uint256 indexed conversationId,
        address indexed proposer,
        address payer,
        address provider,
        uint256 amount,
        uint8 timeoutDays,
        address arbiter,
        bytes32 termsHash
    );
    event ProposalAccepted(uint256 indexed proposalId, address indexed accepter);
    event ProposalWithdrawn(uint256 indexed proposalId, address indexed account);
    event ProposalSuperseded(uint256 indexed proposalId, uint256 indexed replacementProposalId);

    modifier onlyEscrow() {
        require(escrowContract != address(0) && msg.sender == escrowContract, "ESCROW_REQUIRED");
        _;
    }

    constructor() {
        CONFIGURATOR = msg.sender;
    }

    function configureEscrow(address escrowAddress) external {
        require(msg.sender == CONFIGURATOR, "CONFIGURATOR_REQUIRED");
        require(escrowContract == address(0), "ESCROW_ALREADY_CONFIGURED");
        require(escrowAddress != address(0), "ESCROW_REQUIRED");
        escrowContract = escrowAddress;
        emit EscrowContractConfigured(escrowAddress);
    }

    function createGig(
        ListingType listingType,
        Category category,
        string calldata title,
        string calldata description,
        uint256 suggestedBudget
    ) external returns (uint256) {
        _requireText(title, MAX_TITLE_BYTES, "TITLE_REQUIRED", "TITLE_TOO_LARGE");
        _requireText(description, MAX_DESCRIPTION_BYTES, "DESCRIPTION_REQUIRED", "DESCRIPTION_TOO_LARGE");
        require(suggestedBudget > 0, "BUDGET_REQUIRED");

        uint256 gigId = gigs.length;
        gigs.push(Gig({
            id: gigId,
            creator: msg.sender,
            listingType: listingType,
            category: category,
            title: title,
            description: description,
            suggestedBudget: suggestedBudget,
            createdAt: uint64(block.timestamp),
            status: GigStatus.Open,
            awardedEscrowId: 0
        }));

        emit GigCreated(gigId, msg.sender, listingType, category, suggestedBudget);
        return gigId;
    }

    function cancelGig(uint256 gigId) external {
        Gig storage gig = _gig(gigId);
        require(gig.creator == msg.sender, "GIG_CREATOR_REQUIRED");
        require(gig.status == GigStatus.Open, "GIG_NOT_OPEN");
        gig.status = GigStatus.Cancelled;
        emit GigCancelled(gigId, msg.sender);
    }

    function startConversation(uint256 gigId, string calldata encryptedInitialMessage) external returns (uint256) {
        Gig storage gig = _gig(gigId);
        require(gig.status == GigStatus.Open, "GIG_NOT_OPEN");
        require(msg.sender != gig.creator, "CREATOR_CANNOT_RESPOND");
        require(conversationIdPlusOne[gigId][msg.sender] == 0, "CONVERSATION_EXISTS");
        _requirePayload(encryptedInitialMessage);

        uint256 conversationId = conversations.length;
        conversations.push(Conversation({
            id: conversationId,
            gigId: gigId,
            creator: gig.creator,
            counterparty: msg.sender,
            createdAt: uint64(block.timestamp),
            messageCount: 0,
            activeProposalId: 0,
            hasActiveProposal: false
        }));
        conversationIdPlusOne[gigId][msg.sender] = conversationId + 1;
        userConversations[gig.creator].push(conversationId);
        userConversations[msg.sender].push(conversationId);

        emit ConversationStarted(conversationId, gigId, msg.sender, gig.creator);
        _storeMessage(conversationId, msg.sender, encryptedInitialMessage, MessageKind.Text, 0);
        return conversationId;
    }

    function sendMessage(uint256 conversationId, string calldata encryptedPayload) external returns (uint256) {
        Conversation storage conversation = _conversation(conversationId);
        _requireParticipant(conversation);
        _requireConversationMessaging(conversation);
        _requirePayload(encryptedPayload);
        return _storeMessage(conversationId, msg.sender, encryptedPayload, MessageKind.Text, 0);
    }

    function proposeTerms(
        uint256 conversationId,
        uint256 amount,
        uint8 timeoutDays,
        address arbiter,
        bytes32 termsHash,
        string calldata encryptedNote
    ) external returns (uint256) {
        Conversation storage conversation = _conversation(conversationId);
        _requireParticipant(conversation);
        _requirePayload(encryptedNote);
        uint256 proposalId = _createProposal(conversationId, amount, timeoutDays, arbiter, termsHash);
        _storeMessage(conversationId, msg.sender, encryptedNote, MessageKind.Proposal, proposalId);
        return proposalId;
    }

    function acceptProposal(uint256 proposalId) external {
        Proposal storage proposal = _proposal(proposalId);
        Conversation storage conversation = _conversation(proposal.conversationId);
        _requireParticipant(conversation);
        require(msg.sender != proposal.proposer, "PROPOSER_CANNOT_ACCEPT");
        require(_gig(conversation.gigId).status == GigStatus.Open, "GIG_NOT_OPEN");
        require(proposal.status == ProposalStatus.Pending, "PROPOSAL_NOT_PENDING");
        proposal.status = ProposalStatus.Accepted;
        emit ProposalAccepted(proposalId, msg.sender);
    }

    function withdrawProposal(uint256 proposalId) external {
        Proposal storage proposal = _proposal(proposalId);
        Conversation storage conversation = _conversation(proposal.conversationId);
        _requireParticipant(conversation);
        require(
            proposal.status == ProposalStatus.Pending || proposal.status == ProposalStatus.Accepted,
            "PROPOSAL_NOT_WITHDRAWABLE"
        );
        proposal.status = ProposalStatus.Withdrawn;
        if (conversation.hasActiveProposal && conversation.activeProposalId == proposalId) {
            conversation.hasActiveProposal = false;
        }
        emit ProposalWithdrawn(proposalId, msg.sender);
    }

    function markProposalFunded(uint256 proposalId, uint256 escrowId) external onlyEscrow {
        Proposal storage proposal = _proposal(proposalId);
        require(proposal.status == ProposalStatus.Accepted, "PROPOSAL_NOT_ACCEPTED");
        Conversation storage conversation = _conversation(proposal.conversationId);
        Gig storage gig = _gig(conversation.gigId);
        require(gig.status == GigStatus.Open, "GIG_NOT_OPEN");

        proposal.status = ProposalStatus.Funded;
        proposal.escrowId = escrowId;
        gig.status = GigStatus.Funded;
        gig.awardedEscrowId = escrowId;
        emit GigFunded(gig.id, proposalId, escrowId);
    }

    function markEscrowFinalized(uint256 gigId, uint256 escrowId, uint8 finalEscrowStatus) external onlyEscrow {
        Gig storage gig = _gig(gigId);
        require(gig.status == GigStatus.Funded, "GIG_NOT_FUNDED");
        require(gig.awardedEscrowId == escrowId, "ESCROW_MISMATCH");
        gig.status = GigStatus.Closed;
        emit GigClosed(gigId, escrowId, finalEscrowStatus);
    }

    function getFundableProposal(uint256 proposalId) external view returns (
        address payer,
        address provider,
        address arbiter,
        uint256 amount,
        uint8 timeoutDays,
        bytes32 termsHash,
        uint256 gigId,
        bool fundable
    ) {
        Proposal storage proposal = _proposal(proposalId);
        Conversation storage conversation = _conversation(proposal.conversationId);
        Gig storage gig = _gig(conversation.gigId);
        return (
            proposal.payer,
            proposal.provider,
            proposal.arbiter,
            proposal.amount,
            proposal.timeoutDays,
            proposal.termsHash,
            gig.id,
            proposal.status == ProposalStatus.Accepted && gig.status == GigStatus.Open
        );
    }

    function getGig(uint256 gigId) external view returns (Gig memory) { return _gig(gigId); }
    function getConversation(uint256 conversationId) external view returns (Conversation memory) { return _conversation(conversationId); }
    function getProposal(uint256 proposalId) external view returns (Proposal memory) { return _proposal(proposalId); }
    function gigCount() external view returns (uint256) { return gigs.length; }
    function proposalCount() external view returns (uint256) { return proposals.length; }
    function conversationCount() external view returns (uint256) { return conversations.length; }
    function messageCount(uint256 conversationId) external view returns (uint256) { return conversationMessages[conversationId].length; }
    function proposalCountForConversation(uint256 conversationId) external view returns (uint256) { return conversationProposals[conversationId].length; }
    function conversationCountFor(address account) external view returns (uint256) { return userConversations[account].length; }

    function getConversationId(uint256 gigId, address counterparty) external view returns (bool exists, uint256 conversationId) {
        uint256 stored = conversationIdPlusOne[gigId][counterparty];
        return (stored != 0, stored == 0 ? 0 : stored - 1);
    }

    function getGigsPage(uint256 offset, uint256 limit) external view returns (Gig[] memory) {
        require(limit <= MAX_PAGE_SIZE, "PAGE_TOO_LARGE");
        uint256 end = _pageEnd(gigs.length, offset, limit);
        Gig[] memory result = new Gig[](end - offset);
        for (uint256 i = offset; i < end; i++) result[i - offset] = gigs[i];
        return result;
    }

    function getConversationsPage(address account, uint256 offset, uint256 limit) external view returns (Conversation[] memory) {
        require(limit <= MAX_PAGE_SIZE, "PAGE_TOO_LARGE");
        uint256[] storage ids = userConversations[account];
        uint256 end = _pageEnd(ids.length, offset, limit);
        Conversation[] memory result = new Conversation[](end - offset);
        for (uint256 i = offset; i < end; i++) result[i - offset] = conversations[ids[i]];
        return result;
    }

    function getMessagesPage(uint256 conversationId, uint256 offset, uint256 limit) external view returns (ChatMessage[] memory) {
        require(limit <= MAX_PAGE_SIZE, "PAGE_TOO_LARGE");
        ChatMessage[] storage items = conversationMessages[conversationId];
        uint256 end = _pageEnd(items.length, offset, limit);
        ChatMessage[] memory result = new ChatMessage[](end - offset);
        for (uint256 i = offset; i < end; i++) result[i - offset] = items[i];
        return result;
    }

    function getProposalsPage(uint256 conversationId, uint256 offset, uint256 limit) external view returns (Proposal[] memory) {
        require(limit <= MAX_PAGE_SIZE, "PAGE_TOO_LARGE");
        uint256[] storage ids = conversationProposals[conversationId];
        uint256 end = _pageEnd(ids.length, offset, limit);
        Proposal[] memory result = new Proposal[](end - offset);
        for (uint256 i = offset; i < end; i++) result[i - offset] = proposals[ids[i]];
        return result;
    }

    function _storeMessage(
        uint256 conversationId,
        address sender,
        string calldata payload,
        MessageKind kind,
        uint256 proposalId
    ) private returns (uint256) {
        Conversation storage conversation = conversations[conversationId];
        uint256 messageId = conversationMessages[conversationId].length;
        conversationMessages[conversationId].push(ChatMessage({
            id: messageId,
            conversationId: conversationId,
            sender: sender,
            payload: payload,
            kind: kind,
            proposalId: proposalId,
            timestamp: uint64(block.timestamp)
        }));
        conversation.messageCount = messageId + 1;
        emit ChatMessageSent(conversationId, messageId, sender, kind, proposalId, uint64(block.timestamp));
        return messageId;
    }

    function _roles(Gig storage gig, Conversation storage conversation) private view returns (address payer, address provider) {
        if (gig.listingType == ListingType.WorkRequest) {
            return (gig.creator, conversation.counterparty);
        }
        return (conversation.counterparty, gig.creator);
    }

    function _createProposal(
        uint256 conversationId,
        uint256 amount,
        uint8 timeoutDays,
        address arbiter,
        bytes32 termsHash
    ) private returns (uint256 proposalId) {
        Conversation storage conversation = conversations[conversationId];
        Gig storage gig = gigs[conversation.gigId];
        require(gig.status == GigStatus.Open, "GIG_NOT_OPEN");
        require(amount > 0, "AMOUNT_REQUIRED");
        require(timeoutDays == 7 || timeoutDays == 14, "INVALID_TIMEOUT");
        require(termsHash != bytes32(0), "TERMS_HASH_REQUIRED");

        (address payer, address provider) = _roles(gig, conversation);
        require(arbiter != address(0), "ARBITER_REQUIRED");
        require(arbiter != payer && arbiter != provider, "ARBITER_MUST_BE_INDEPENDENT");

        proposalId = proposals.length;
        _supersedePendingProposal(conversation, proposalId);

        Proposal storage proposal = proposals.push();
        proposal.id = proposalId;
        proposal.conversationId = conversationId;
        proposal.proposer = msg.sender;
        proposal.payer = payer;
        proposal.provider = provider;
        proposal.arbiter = arbiter;
        proposal.amount = amount;
        proposal.timeoutDays = timeoutDays;
        proposal.termsHash = termsHash;
        proposal.createdAt = uint64(block.timestamp);
        proposal.status = ProposalStatus.Pending;
        conversationProposals[conversationId].push(proposalId);
        conversation.activeProposalId = proposalId;
        conversation.hasActiveProposal = true;
        _emitProposalCreated(proposal);
    }

    function _supersedePendingProposal(Conversation storage conversation, uint256 replacementProposalId) private {
        if (!conversation.hasActiveProposal) return;
        Proposal storage previous = proposals[conversation.activeProposalId];
        require(previous.status != ProposalStatus.Accepted, "ACCEPTED_PROPOSAL_ACTIVE");
        if (previous.status == ProposalStatus.Pending) {
            previous.status = ProposalStatus.Superseded;
            emit ProposalSuperseded(previous.id, replacementProposalId);
        }
    }

    function _emitProposalCreated(Proposal storage proposal) private {
        emit ProposalCreated(
            proposal.id,
            proposal.conversationId,
            proposal.proposer,
            proposal.payer,
            proposal.provider,
            proposal.amount,
            proposal.timeoutDays,
            proposal.arbiter,
            proposal.termsHash
        );
    }

    function _requireParticipant(Conversation storage conversation) private view {
        require(msg.sender == conversation.creator || msg.sender == conversation.counterparty, "CONVERSATION_PARTICIPANT_REQUIRED");
    }

    function _requireConversationMessaging(Conversation storage conversation) private view {
        GigStatus status = gigs[conversation.gigId].status;
        require(status == GigStatus.Open || status == GigStatus.Funded, "CONVERSATION_CLOSED");
    }

    function _requirePayload(string calldata payload) private pure {
        _requireText(payload, MAX_PAYLOAD_BYTES, "PAYLOAD_REQUIRED", "PAYLOAD_TOO_LARGE");
    }

    function _requireText(
        string calldata value,
        uint256 maximum,
        string memory emptyError,
        string memory largeError
    ) private pure {
        uint256 length = bytes(value).length;
        require(length > 0, emptyError);
        require(length <= maximum, largeError);
    }

    function _gig(uint256 gigId) private view returns (Gig storage) {
        require(gigId < gigs.length, "GIG_NOT_FOUND");
        return gigs[gigId];
    }

    function _conversation(uint256 conversationId) private view returns (Conversation storage) {
        require(conversationId < conversations.length, "CONVERSATION_NOT_FOUND");
        return conversations[conversationId];
    }

    function _proposal(uint256 proposalId) private view returns (Proposal storage) {
        require(proposalId < proposals.length, "PROPOSAL_NOT_FOUND");
        return proposals[proposalId];
    }

    function _pageEnd(uint256 length, uint256 offset, uint256 limit) private pure returns (uint256) {
        if (offset >= length || limit == 0) return offset;
        uint256 end = offset + limit;
        return end > length ? length : end;
    }
}
