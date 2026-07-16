// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IArcanumGigBoardEscrow {
    function getFundableProposal(uint256 proposalId) external view returns (
        address payer,
        address provider,
        address arbiter,
        uint256 amount,
        uint8 timeoutDays,
        bytes32 termsHash,
        uint256 gigId,
        bool fundable
    );

    function markProposalFunded(uint256 proposalId, uint256 escrowId) external;
    function markEscrowFinalized(uint256 gigId, uint256 escrowId, uint8 finalEscrowStatus) external;
}

contract ArcanumEscrow {
    uint256 public constant MAX_EVIDENCE_URI_BYTES = 512;
    uint256 public constant MAX_PAGE_SIZE = 100;

    enum EscrowStatus { Locked, Released, Refunded, Disputed }

    struct Escrow {
        uint256 id;
        uint256 gigId;
        uint256 proposalId;
        address payer;
        address provider;
        address arbiter;
        uint256 amount;
        uint64 createdAt;
        uint64 deadline;
        bytes32 termsHash;
        EscrowStatus status;
        bytes32 resolutionHash;
        string resolutionURI;
    }

    struct Evidence {
        uint256 id;
        address author;
        bytes32 evidenceHash;
        string evidenceURI;
        uint64 timestamp;
    }

    IArcanumGigBoardEscrow public immutable GIG_BOARD;
    Escrow[] private escrows;
    mapping(uint256 => Evidence[]) private escrowEvidence;
    mapping(address => uint256[]) private userEscrows;
    bool private entered;

    event EscrowLocked(
        uint256 indexed escrowId,
        uint256 indexed gigId,
        uint256 indexed proposalId,
        address payer,
        address provider,
        address arbiter,
        uint256 amount,
        uint64 deadline,
        bytes32 termsHash
    );
    event EscrowReleased(uint256 indexed escrowId, address indexed provider, uint256 amount);
    event EscrowRefunded(uint256 indexed escrowId, address indexed payer, uint256 amount);
    event EscrowDisputed(uint256 indexed escrowId, address indexed openedBy, uint64 timestamp);
    event EvidenceSubmitted(
        uint256 indexed escrowId,
        uint256 indexed evidenceId,
        address indexed author,
        bytes32 evidenceHash,
        string evidenceURI
    );
    event DisputeResolved(
        uint256 indexed escrowId,
        address indexed arbiter,
        EscrowStatus resolution,
        bytes32 resolutionHash,
        string resolutionURI
    );

    modifier nonReentrant() {
        require(!entered, "REENTRANT_CALL");
        entered = true;
        _;
        entered = false;
    }

    constructor(address gigBoard) {
        require(gigBoard != address(0), "GIG_BOARD_REQUIRED");
        GIG_BOARD = IArcanumGigBoardEscrow(gigBoard);
    }

    function fundProposal(uint256 proposalId) external payable nonReentrant returns (uint256) {
        (
            address payer,
            address provider,
            address arbiter,
            uint256 amount,
            uint8 timeoutDays,
            bytes32 termsHash,
            uint256 gigId,
            bool fundable
        ) = GIG_BOARD.getFundableProposal(proposalId);

        require(fundable, "PROPOSAL_NOT_FUNDABLE");
        require(msg.sender == payer, "PAYER_REQUIRED");
        require(msg.value == amount, "INVALID_ESCROW_AMOUNT");
        require(provider != address(0) && provider != payer, "INVALID_PROVIDER");
        require(arbiter != address(0) && arbiter != payer && arbiter != provider, "INVALID_ARBITER");
        require(timeoutDays == 7 || timeoutDays == 14, "INVALID_TIMEOUT");
        require(termsHash != bytes32(0), "TERMS_HASH_REQUIRED");

        uint256 escrowId = escrows.length;
        uint64 createdAt = uint64(block.timestamp);
        uint64 deadline = uint64(block.timestamp + uint256(timeoutDays) * 1 days);
        escrows.push(Escrow({
            id: escrowId,
            gigId: gigId,
            proposalId: proposalId,
            payer: payer,
            provider: provider,
            arbiter: arbiter,
            amount: amount,
            createdAt: createdAt,
            deadline: deadline,
            termsHash: termsHash,
            status: EscrowStatus.Locked,
            resolutionHash: bytes32(0),
            resolutionURI: ""
        }));
        userEscrows[payer].push(escrowId);
        userEscrows[provider].push(escrowId);
        userEscrows[arbiter].push(escrowId);

        GIG_BOARD.markProposalFunded(proposalId, escrowId);
        emit EscrowLocked(escrowId, gigId, proposalId, payer, provider, arbiter, amount, deadline, termsHash);
        return escrowId;
    }

    function release(uint256 escrowId) external nonReentrant {
        Escrow storage item = _escrow(escrowId);
        require(item.status == EscrowStatus.Locked, "ESCROW_NOT_LOCKED");
        require(msg.sender == item.payer, "PAYER_REQUIRED");
        item.status = EscrowStatus.Released;
        GIG_BOARD.markEscrowFinalized(item.gigId, escrowId, uint8(EscrowStatus.Released));
        _payout(item.provider, item.amount);
        emit EscrowReleased(escrowId, item.provider, item.amount);
    }

    function refund(uint256 escrowId) external nonReentrant {
        Escrow storage item = _escrow(escrowId);
        require(item.status == EscrowStatus.Locked, "ESCROW_NOT_LOCKED");
        require(msg.sender == item.provider, "PROVIDER_REQUIRED");
        item.status = EscrowStatus.Refunded;
        GIG_BOARD.markEscrowFinalized(item.gigId, escrowId, uint8(EscrowStatus.Refunded));
        _payout(item.payer, item.amount);
        emit EscrowRefunded(escrowId, item.payer, item.amount);
    }

    function openDispute(uint256 escrowId, bytes32 evidenceHash, string calldata evidenceURI) external {
        Escrow storage item = _escrow(escrowId);
        require(item.status == EscrowStatus.Locked, "ESCROW_NOT_LOCKED");
        _requireParty(item);
        item.status = EscrowStatus.Disputed;
        emit EscrowDisputed(escrowId, msg.sender, uint64(block.timestamp));
        _storeEvidence(escrowId, evidenceHash, evidenceURI);
    }

    function submitEvidence(uint256 escrowId, bytes32 evidenceHash, string calldata evidenceURI) external {
        Escrow storage item = _escrow(escrowId);
        require(item.status == EscrowStatus.Disputed, "ESCROW_NOT_DISPUTED");
        _requireParty(item);
        _storeEvidence(escrowId, evidenceHash, evidenceURI);
    }

    function resolveDispute(
        uint256 escrowId,
        bool releaseToProvider,
        bytes32 resolutionHash,
        string calldata resolutionURI
    ) external nonReentrant {
        Escrow storage item = _escrow(escrowId);
        require(item.status == EscrowStatus.Disputed, "ESCROW_NOT_DISPUTED");
        require(msg.sender == item.arbiter, "ARBITER_REQUIRED");
        _requireEvidence(resolutionHash, resolutionURI);

        EscrowStatus resolution = releaseToProvider ? EscrowStatus.Released : EscrowStatus.Refunded;
        item.status = resolution;
        item.resolutionHash = resolutionHash;
        item.resolutionURI = resolutionURI;
        GIG_BOARD.markEscrowFinalized(item.gigId, escrowId, uint8(resolution));

        address recipient = releaseToProvider ? item.provider : item.payer;
        _payout(recipient, item.amount);
        emit DisputeResolved(escrowId, msg.sender, resolution, resolutionHash, resolutionURI);
        if (releaseToProvider) {
            emit EscrowReleased(escrowId, item.provider, item.amount);
        } else {
            emit EscrowRefunded(escrowId, item.payer, item.amount);
        }
    }

    function getEscrow(uint256 escrowId) external view returns (Escrow memory) { return _escrow(escrowId); }
    function escrowCount() external view returns (uint256) { return escrows.length; }
    function escrowCountFor(address account) external view returns (uint256) { return userEscrows[account].length; }
    function evidenceCount(uint256 escrowId) external view returns (uint256) { return escrowEvidence[escrowId].length; }

    function getEscrowsFor(address account, uint256 offset, uint256 limit) external view returns (Escrow[] memory) {
        require(limit <= MAX_PAGE_SIZE, "PAGE_TOO_LARGE");
        uint256[] storage ids = userEscrows[account];
        uint256 end = _pageEnd(ids.length, offset, limit);
        Escrow[] memory result = new Escrow[](end - offset);
        for (uint256 i = offset; i < end; i++) result[i - offset] = escrows[ids[i]];
        return result;
    }

    function getEvidencePage(uint256 escrowId, uint256 offset, uint256 limit) external view returns (Evidence[] memory) {
        require(limit <= MAX_PAGE_SIZE, "PAGE_TOO_LARGE");
        Evidence[] storage items = escrowEvidence[escrowId];
        uint256 end = _pageEnd(items.length, offset, limit);
        Evidence[] memory result = new Evidence[](end - offset);
        for (uint256 i = offset; i < end; i++) result[i - offset] = items[i];
        return result;
    }

    function isOverdue(uint256 escrowId) external view returns (bool) {
        Escrow storage item = _escrow(escrowId);
        return item.status == EscrowStatus.Locked && block.timestamp >= item.deadline;
    }

    function _storeEvidence(uint256 escrowId, bytes32 evidenceHash, string calldata evidenceURI) private {
        _requireEvidence(evidenceHash, evidenceURI);
        uint256 evidenceId = escrowEvidence[escrowId].length;
        escrowEvidence[escrowId].push(Evidence({
            id: evidenceId,
            author: msg.sender,
            evidenceHash: evidenceHash,
            evidenceURI: evidenceURI,
            timestamp: uint64(block.timestamp)
        }));
        emit EvidenceSubmitted(escrowId, evidenceId, msg.sender, evidenceHash, evidenceURI);
    }

    function _requireEvidence(bytes32 evidenceHash, string calldata evidenceURI) private pure {
        require(evidenceHash != bytes32(0), "EVIDENCE_HASH_REQUIRED");
        uint256 length = bytes(evidenceURI).length;
        require(length > 0, "EVIDENCE_URI_REQUIRED");
        require(length <= MAX_EVIDENCE_URI_BYTES, "EVIDENCE_URI_TOO_LARGE");
    }

    function _requireParty(Escrow storage item) private view {
        require(msg.sender == item.payer || msg.sender == item.provider, "ESCROW_PARTY_REQUIRED");
    }

    function _payout(address recipient, uint256 amount) private {
        (bool sent, ) = recipient.call{value: amount}("");
        require(sent, "PAYOUT_FAILED");
    }

    function _escrow(uint256 escrowId) private view returns (Escrow storage) {
        require(escrowId < escrows.length, "ESCROW_NOT_FOUND");
        return escrows[escrowId];
    }

    function _pageEnd(uint256 length, uint256 offset, uint256 limit) private pure returns (uint256) {
        if (offset >= length || limit == 0) return offset;
        uint256 end = offset + limit;
        return end > length ? length : end;
    }

    receive() external payable {
        revert("DIRECT_PAYMENT_DISABLED");
    }
}
