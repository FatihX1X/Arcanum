'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Bot,
  BriefcaseBusiness,
  Check,
  Clock3,
  ExternalLink,
  FileCheck2,
  Filter,
  Gavel,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Undo2,
  WalletCards,
  X,
} from 'lucide-react';
import { encodePacked, formatEther, isAddress, isHex, keccak256, parseEther, toBytes } from 'viem';
import { useAccount, useChainId, usePublicClient, useReadContract, useWatchContractEvent, useWriteContract } from 'wagmi';
import { arcanumAgentsAbi, arcanumAgentsAddress, isArcanumAgentsConfigured } from '../lib/agentsContract';
import { arcNetworkTestnet, transactionUrl } from '../lib/chain';
import { arcanumMessengerAbi, arcanumMessengerAddress } from '../lib/contract';
import {
  decryptEscrowChatMessage,
  encryptEscrowChatMessage,
  hasStoredEncryptionKey,
  isEncryptionKeyUnlocked,
  type EscrowChatCryptoContext,
} from '../lib/crypto';
import { arcTestnetDeployments } from '../lib/deployments';
import {
  arcanumEscrowAbi,
  arcanumEscrowAddress,
  arcanumGigBoardAbi,
  arcanumGigBoardAddress,
  isArcanumEscrowSuiteConfigured,
  type EscrowChatMessage,
  type EscrowConversation,
  type EscrowEvidence,
  type EscrowProposal,
  type EscrowRecord,
  type GigCategory,
  type GigRecord,
  type ListingType,
} from '../lib/escrowContracts';
import type { Language } from './arcanumCopy';

type RootTab = 'board' | 'escrows';
type MobilePane = 'gigs' | 'chat' | 'escrow';
type EscrowFilter = 'active' | 'history';
type ActivityItem = { key: string; label: string; hash: `0x${string}`; block: bigint };

const pageSize = 100n;
const statusLabels = ['Locked', 'Released', 'Refunded', 'Disputed'] as const;
const proposalStatusLabels = ['Pending', 'Accepted', 'Withdrawn', 'Superseded', 'Funded'] as const;
const categoryLabels = ['Development', 'Design', 'Marketing', 'Testing', 'Other'] as const;

const text = {
  en: {
    eyebrow: 'On-chain work marketplace', title: 'ArcanumEscrow', subtitle: 'Negotiate privately, agree on public terms, and lock native Arc USDC.',
    board: 'Gig Board', mine: 'My Escrows', newGig: 'Create gig', search: 'Search gigs', allTypes: 'All listing types', allCategories: 'All categories',
    workRequest: 'Work request', serviceOffer: 'Service offer', open: 'Open', funded: 'Funded', budget: 'Suggested budget', noGigs: 'No matching active gigs.',
    chat: 'Private negotiation', chooseGig: 'Select a gig to open its negotiation workspace.', responses: 'Responses', start: 'Start private chat', initial: 'Introduce yourself and describe your offer...',
    message: 'Write an encrypted message...', send: 'Send', propose: 'Propose escrow', keyNeeded: 'Unlock or register your Arcanum encryption key before using escrow chat.', recipientKey: 'The counterparty has no Arcanum encryption key.',
    contractMissing: 'Escrow contracts are not configured. Deploy the suite and set the two NEXT_PUBLIC contract addresses.',
    proposal: 'Escrow proposal', accept: 'Accept terms', withdraw: 'Withdraw', fund: 'Create & fund escrow', payer: 'Payer', provider: 'Provider', arbiter: 'Arbiter', timeout: 'Timeout', terms: 'Delivery terms', amount: 'Amount (USDC)',
    escrow: 'Escrow card', selectEscrow: 'Select or fund an escrow to see protected payment controls.', release: 'Release', refund: 'Refund', dispute: 'Open dispute', evidence: 'Add evidence', resolveProvider: 'Resolve: provider', resolvePayer: 'Resolve: payer',
    deadline: 'Deadline', overdue: 'Overdue — funds remain locked', active: 'Active', history: 'History', noEscrows: 'No escrows in this view.', activity: 'On-chain activity', noActivity: 'No indexed escrow events yet.',
    createTitle: 'Create a public gig', titleField: 'Title', description: 'Description', listingType: 'Listing type', category: 'Category', cancel: 'Cancel', create: 'Publish gig',
    proposeTitle: 'Propose protected terms', days7: '7 days', days14: '14 days', evidenceTitle: 'Dispute evidence', evidenceHash: 'Content hash (bytes32)', evidenceUri: 'Content-addressed URI', submit: 'Submit on-chain', resolutionTitle: 'Arbiter resolution',
    pending: 'Waiting for wallet and confirmation...', confirmed: 'Transaction confirmed.', refresh: 'Refresh', explorer: 'ArcScan', encrypted: 'Encrypted message', decryptFailed: 'Unlock the matching local key to read this payload.', roleAgent: 'Agent',
    rpcError: 'Arc RPC is temporarily unavailable. Live data will retry automatically.',
  },
  tr: {
    eyebrow: 'On-chain iş pazarı', title: 'ArcanumEscrow', subtitle: 'Gizli görüş, açık şartlarda anlaş ve native Arc USDC ödemesini kilitle.',
    board: 'İş İlanları', mine: 'Escrowlarım', newGig: 'İlan oluştur', search: 'İlan ara', allTypes: 'Tüm ilan türleri', allCategories: 'Tüm kategoriler',
    workRequest: 'İş talebi', serviceOffer: 'Hizmet teklifi', open: 'Açık', funded: 'Fonlandı', budget: 'Önerilen bütçe', noGigs: 'Eşleşen aktif ilan yok.',
    chat: 'Gizli görüşme', chooseGig: 'Görüşme alanını açmak için bir ilan seç.', responses: 'Yanıtlar', start: 'Gizli sohbet başlat', initial: 'Kendini ve teklifini anlat...',
    message: 'Şifreli mesaj yaz...', send: 'Gönder', propose: 'Escrow öner', keyNeeded: 'Escrow sohbeti için Arcanum şifreleme anahtarını kaydet veya kilidini aç.', recipientKey: 'Karşı tarafın Arcanum şifreleme anahtarı yok.',
    contractMissing: 'Escrow kontratları yapılandırılmamış. Suite’i deploy edip iki NEXT_PUBLIC kontrat adresini ayarla.',
    proposal: 'Escrow teklifi', accept: 'Şartları kabul et', withdraw: 'Geri çek', fund: 'Escrow oluştur ve fonla', payer: 'Ödeyen', provider: 'Sağlayıcı', arbiter: 'Hakem', timeout: 'Süre', terms: 'Teslim şartları', amount: 'Tutar (USDC)',
    escrow: 'Escrow kartı', selectEscrow: 'Güvenli ödeme kontrolleri için bir escrow seç veya fonla.', release: 'Serbest bırak', refund: 'İade et', dispute: 'Uyuşmazlık aç', evidence: 'Kanıt ekle', resolveProvider: 'Karar: sağlayıcı', resolvePayer: 'Karar: ödeyen',
    deadline: 'Son tarih', overdue: 'Süre doldu — fon kilitli kalır', active: 'Aktif', history: 'Geçmiş', noEscrows: 'Bu görünümde escrow yok.', activity: 'On-chain hareketler', noActivity: 'Henüz indekslenmiş escrow eventi yok.',
    createTitle: 'Açık iş ilanı oluştur', titleField: 'Başlık', description: 'Açıklama', listingType: 'İlan türü', category: 'Kategori', cancel: 'Vazgeç', create: 'İlanı yayınla',
    proposeTitle: 'Güvenli şartlar öner', days7: '7 gün', days14: '14 gün', evidenceTitle: 'Uyuşmazlık kanıtı', evidenceHash: 'İçerik hash’i (bytes32)', evidenceUri: 'İçerik adresli URI', submit: 'On-chain gönder', resolutionTitle: 'Hakem kararı',
    pending: 'Cüzdan ve zincir onayı bekleniyor...', confirmed: 'İşlem onaylandı.', refresh: 'Yenile', explorer: 'ArcScan', encrypted: 'Şifreli mesaj', decryptFailed: 'Bu payload’ı okumak için eşleşen local key kilidini aç.', roleAgent: 'Agent',
    rpcError: 'Arc RPC geçici olarak erişilemiyor. Canlı veri otomatik olarak yeniden denenecek.',
  },
} as const;

function short(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function same(a?: string, b?: string) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

function date(value: bigint, language: Language) {
  return new Date(Number(value) * 1000).toLocaleString(language === 'tr' ? 'tr-TR' : 'en-US');
}

function conversationContext(gig: GigRecord, counterparty: `0x${string}`) {
  return keccak256(encodePacked(
    ['uint256', 'address', 'address', 'address'],
    [gig.id, arcanumGigBoardAddress, gig.creator, counterparty],
  ));
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (message.toLowerCase().includes('rejected') || message.toLowerCase().includes('denied')) return 'Wallet request rejected.';
  return message.split('\n')[0] || 'Transaction failed.';
}

export default function ArcanumEscrow({ language, onOpenKeyCenter }: { language: Language; onOpenKeyCenter: () => void }) {
  const t = text[language];
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { writeContractAsync, isPending: walletPending } = useWriteContract();
  const [rootTab, setRootTab] = useState<RootTab>('board');
  const [mobilePane, setMobilePane] = useState<MobilePane>('gigs');
  const [escrowFilter, setEscrowFilter] = useState<EscrowFilter>('active');
  const [gigs, setGigs] = useState<GigRecord[]>([]);
  const [conversations, setConversations] = useState<EscrowConversation[]>([]);
  const [messages, setMessages] = useState<EscrowChatMessage[]>([]);
  const [proposals, setProposals] = useState<EscrowProposal[]>([]);
  const [escrows, setEscrows] = useState<EscrowRecord[]>([]);
  const [evidence, setEvidence] = useState<EscrowEvidence[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [selectedGigId, setSelectedGigId] = useState<bigint | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<bigint | null>(null);
  const [selectedEscrowId, setSelectedEscrowId] = useState<bigint | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | ListingType>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | GigCategory>('all');
  const [status, setStatus] = useState('');
  const [flowError, setFlowError] = useState('');
  const [dataError, setDataError] = useState('');
  const [lastHash, setLastHash] = useState<`0x${string}`>();
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [disputeMode, setDisputeMode] = useState<'open' | 'evidence' | null>(null);
  const [resolutionMode, setResolutionMode] = useState<'provider' | 'payer' | null>(null);
  const [initialMessage, setInitialMessage] = useState('');
  const [composer, setComposer] = useState('');

  const configured = isArcanumEscrowSuiteConfigured;
  const correctChain = chainId === arcNetworkTestnet.id;
  const selectedGig = gigs.find((gig) => gig.id === selectedGigId);
  const selectedConversation = conversations.find((item) => item.id === selectedConversationId);
  const conversationOptions = conversations.filter((item) => item.gigId === selectedGigId);
  const proposalEscrow = proposals.find((proposal) => proposal.status === 4)
    ? escrows.find((item) => item.proposalId === proposals.find((proposal) => proposal.status === 4)?.id)
    : undefined;
  const selectedEscrow = escrows.find((item) => item.id === selectedEscrowId) ?? proposalEscrow;
  const selectedEvidence = selectedEscrow ? evidence : [];
  const txUrl = lastHash ? transactionUrl(lastHash) : undefined;

  const refreshCore = useCallback(async () => {
    if (!publicClient || !configured) return;
    try {
      const nextGigs = await publicClient.readContract({
        address: arcanumGigBoardAddress,
        abi: arcanumGigBoardAbi,
        functionName: 'getGigsPage',
        args: [0n, pageSize],
      });
      setGigs(nextGigs as GigRecord[]);
      setDataError('');
      if (address) {
        const [nextConversations, nextEscrows] = await Promise.all([
          publicClient.readContract({ address: arcanumGigBoardAddress, abi: arcanumGigBoardAbi, functionName: 'getConversationsPage', args: [address, 0n, pageSize] }),
          publicClient.readContract({ address: arcanumEscrowAddress, abi: arcanumEscrowAbi, functionName: 'getEscrowsFor', args: [address, 0n, pageSize] }),
        ]);
        setConversations(nextConversations as EscrowConversation[]);
        setEscrows(nextEscrows as EscrowRecord[]);
      } else {
        setConversations([]);
        setEscrows([]);
      }
    } catch {
      setDataError(t.rpcError);
    }
  }, [address, configured, publicClient, t.rpcError]);

  const refreshConversation = useCallback(async () => {
    if (!publicClient || !configured || selectedConversationId === null) {
      setMessages([]);
      setProposals([]);
      return;
    }
    const [nextMessages, nextProposals] = await Promise.all([
      publicClient.readContract({ address: arcanumGigBoardAddress, abi: arcanumGigBoardAbi, functionName: 'getMessagesPage', args: [selectedConversationId, 0n, pageSize] }),
      publicClient.readContract({ address: arcanumGigBoardAddress, abi: arcanumGigBoardAbi, functionName: 'getProposalsPage', args: [selectedConversationId, 0n, pageSize] }),
    ]);
    setMessages(nextMessages as EscrowChatMessage[]);
    setProposals(nextProposals as EscrowProposal[]);
  }, [configured, publicClient, selectedConversationId]);

  const refreshEvidence = useCallback(async () => {
    if (!publicClient || !configured || !selectedEscrow) {
      setEvidence([]);
      return;
    }
    const next = await publicClient.readContract({
      address: arcanumEscrowAddress,
      abi: arcanumEscrowAbi,
      functionName: 'getEvidencePage',
      args: [selectedEscrow.id, 0n, pageSize],
    });
    setEvidence(next as EscrowEvidence[]);
  }, [configured, publicClient, selectedEscrow]);

  const refreshActivity = useCallback(async () => {
    if (!publicClient || !configured || !selectedEscrow || Number(arcTestnetDeployments.escrow.blockNumber) === 0) {
      setActivity([]);
      return;
    }
    try {
      const logs = await publicClient.getContractEvents({
        address: arcanumEscrowAddress,
        abi: arcanumEscrowAbi,
        fromBlock: BigInt(arcTestnetDeployments.escrow.blockNumber),
        toBlock: 'latest',
      });
      const filtered = logs.filter((log) => {
        const args = log.args as { escrowId?: bigint };
        return args.escrowId === selectedEscrow.id;
      }).map((log) => ({
        key: `${log.transactionHash}-${log.logIndex}`,
        label: log.eventName,
        hash: log.transactionHash,
        block: log.blockNumber,
      })).sort((a, b) => (a.block > b.block ? -1 : 1));
      setActivity(filtered);
    } catch {
      setActivity([]);
    }
  }, [configured, publicClient, selectedEscrow]);

  useEffect(() => { void refreshCore(); }, [refreshCore]);
  useEffect(() => { void refreshConversation(); }, [refreshConversation]);
  useEffect(() => { void refreshEvidence(); void refreshActivity(); }, [refreshActivity, refreshEvidence]);
  useEffect(() => {
    if (!configured) return;
    const interval = window.setInterval(() => { void refreshCore(); void refreshConversation(); }, 4000);
    return () => window.clearInterval(interval);
  }, [configured, refreshConversation, refreshCore]);

  useEffect(() => {
    if (selectedGigId === null) return;
    const matches = conversations.filter((item) => item.gigId === selectedGigId);
    if (!matches.some((item) => item.id === selectedConversationId)) setSelectedConversationId(matches[0]?.id ?? null);
  }, [conversations, selectedConversationId, selectedGigId]);

  useWatchContractEvent({
    address: arcanumGigBoardAddress,
    abi: arcanumGigBoardAbi,
    enabled: configured,
    onLogs: () => { void refreshCore(); void refreshConversation(); },
  });
  useWatchContractEvent({
    address: arcanumEscrowAddress,
    abi: arcanumEscrowAbi,
    enabled: configured,
    onLogs: () => { void refreshCore(); void refreshEvidence(); void refreshActivity(); },
  });

  async function resolveKey(account: `0x${string}`) {
    if (!publicClient) return '';
    if (isArcanumAgentsConfigured) {
      const active = await publicClient.readContract({ address: arcanumAgentsAddress, abi: arcanumAgentsAbi, functionName: 'isActiveAgent', args: [account] });
      if (active) {
        const agentKey = await publicClient.readContract({ address: arcanumAgentsAddress, abi: arcanumAgentsAbi, functionName: 'encryptionKeys', args: [account] });
        if (agentKey) return String(agentKey);
      }
    }
    return String(await publicClient.readContract({ address: arcanumMessengerAddress, abi: arcanumMessengerAbi, functionName: 'encryptionKeys', args: [account] }));
  }

  function requireLocalKey() {
    if (!address || !hasStoredEncryptionKey(address) || !isEncryptionKeyUnlocked(address)) {
      setFlowError(t.keyNeeded);
      onOpenKeyCenter();
      return false;
    }
    return true;
  }

  async function transact(label: string, action: () => Promise<`0x${string}`>) {
    if (!publicClient || busy || walletPending) return false;
    setBusy(true);
    setFlowError('');
    setStatus(t.pending);
    try {
      const hash = await action();
      setLastHash(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      setStatus(t.confirmed);
      await refreshCore();
      await refreshConversation();
      return true;
    } catch (error) {
      setStatus('');
      setFlowError(`${label}: ${errorMessage(error)}`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createGig(input: { listingType: ListingType; category: GigCategory; title: string; description: string; budget: string }) {
    const confirmed = await transact(t.create, () => writeContractAsync({
      address: arcanumGigBoardAddress,
      abi: arcanumGigBoardAbi,
      functionName: 'createGig',
      args: [input.listingType, input.category, input.title.trim(), input.description.trim(), parseEther(input.budget)],
    }));
    if (confirmed) setCreateOpen(false);
  }

  async function encryptForConversation(plain: string, conversation: EscrowConversation, gig: GigRecord) {
    if (!address || !requireLocalKey()) throw new Error(t.keyNeeded);
    const recipient = same(address, conversation.creator) ? conversation.counterparty : conversation.creator;
    const recipientKey = await resolveKey(recipient);
    if (!recipientKey) throw new Error(t.recipientKey);
    return encryptEscrowChatMessage(plain, recipientKey, {
      chainId: arcNetworkTestnet.id,
      contractAddress: arcanumGigBoardAddress,
      conversationId: conversationContext(gig, conversation.counterparty),
      senderAddress: address,
      recipientAddress: recipient,
    });
  }

  async function startConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address || !selectedGig || !initialMessage.trim() || !requireLocalKey()) return;
    try {
      const recipientKey = await resolveKey(selectedGig.creator);
      if (!recipientKey) { setFlowError(t.recipientKey); return; }
      const payload = await encryptEscrowChatMessage(initialMessage.trim(), recipientKey, {
        chainId: arcNetworkTestnet.id,
        contractAddress: arcanumGigBoardAddress,
        conversationId: conversationContext(selectedGig, address),
        senderAddress: address,
        recipientAddress: selectedGig.creator,
      });
      const confirmed = await transact(t.start, () => writeContractAsync({ address: arcanumGigBoardAddress, abi: arcanumGigBoardAbi, functionName: 'startConversation', args: [selectedGig.id, payload] }));
      if (confirmed) setInitialMessage('');
    } catch (error) {
      setFlowError(errorMessage(error));
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedConversation || !selectedGig || !composer.trim()) return;
    try {
      const payload = await encryptForConversation(composer.trim(), selectedConversation, selectedGig);
      const confirmed = await transact(t.send, () => writeContractAsync({ address: arcanumGigBoardAddress, abi: arcanumGigBoardAbi, functionName: 'sendMessage', args: [selectedConversation.id, payload] }));
      if (confirmed) setComposer('');
    } catch (error) {
      setFlowError(errorMessage(error));
    }
  }

  async function proposeTerms(input: { amount: string; timeout: 7 | 14; arbiter: `0x${string}`; terms: string }) {
    if (!selectedConversation || !selectedGig) return;
    try {
      const termsHash = keccak256(toBytes(input.terms.trim()));
      const payload = await encryptForConversation(input.terms.trim(), selectedConversation, selectedGig);
      const confirmed = await transact(t.propose, () => writeContractAsync({
        address: arcanumGigBoardAddress,
        abi: arcanumGigBoardAbi,
        functionName: 'proposeTerms',
        args: [selectedConversation.id, parseEther(input.amount), input.timeout, input.arbiter, termsHash, payload],
      }));
      if (confirmed) setProposalOpen(false);
    } catch (error) {
      setFlowError(errorMessage(error));
    }
  }

  async function proposalAction(proposal: EscrowProposal, action: 'accept' | 'withdraw' | 'fund') {
    if (action === 'fund') {
      await transact(t.fund, () => writeContractAsync({ address: arcanumEscrowAddress, abi: arcanumEscrowAbi, functionName: 'fundProposal', args: [proposal.id], value: proposal.amount }));
      return;
    }
    await transact(action === 'accept' ? t.accept : t.withdraw, () => writeContractAsync({
      address: arcanumGigBoardAddress,
      abi: arcanumGigBoardAbi,
      functionName: action === 'accept' ? 'acceptProposal' : 'withdrawProposal',
      args: [proposal.id],
    }));
  }

  async function escrowAction(action: 'release' | 'refund') {
    if (!selectedEscrow) return;
    await transact(action === 'release' ? t.release : t.refund, () => writeContractAsync({ address: arcanumEscrowAddress, abi: arcanumEscrowAbi, functionName: action, args: [selectedEscrow.id] }));
  }

  async function submitEvidence(input: { hash: `0x${string}`; uri: string }) {
    if (!selectedEscrow || !disputeMode) return;
    const confirmed = await transact(t.submit, () => writeContractAsync({
      address: arcanumEscrowAddress,
      abi: arcanumEscrowAbi,
      functionName: disputeMode === 'open' ? 'openDispute' : 'submitEvidence',
      args: [selectedEscrow.id, input.hash, input.uri.trim()],
    }));
    if (confirmed) setDisputeMode(null);
  }

  async function resolveDispute(input: { hash: `0x${string}`; uri: string }) {
    if (!selectedEscrow || !resolutionMode) return;
    const confirmed = await transact(t.submit, () => writeContractAsync({
      address: arcanumEscrowAddress,
      abi: arcanumEscrowAbi,
      functionName: 'resolveDispute',
      args: [selectedEscrow.id, resolutionMode === 'provider', input.hash, input.uri.trim()],
    }));
    if (confirmed) setResolutionMode(null);
  }

  const filteredGigs = useMemo(() => gigs.filter((gig) => {
    if (gig.status !== 0) return false;
    if (typeFilter !== 'all' && gig.listingType !== typeFilter) return false;
    if (categoryFilter !== 'all' && gig.category !== categoryFilter) return false;
    const query = search.trim().toLowerCase();
    return !query || `${gig.title} ${gig.description}`.toLowerCase().includes(query);
  }), [categoryFilter, gigs, search, typeFilter]);

  const filteredEscrows = useMemo(() => escrows.filter((item) => escrowFilter === 'active' ? item.status === 0 || item.status === 3 : item.status === 1 || item.status === 2), [escrowFilter, escrows]);

  return (
    <section className="min-w-0">
      <div className="panel mb-4">
        <div className="panel-header">
          <div>
            <p className="eyebrow">{t.eyebrow}</p>
            <h1 className="panel-title flex items-center gap-2"><ShieldCheck size={20} className="text-emerald-300" />{t.title}</h1>
            <p className="mt-2 text-sm text-zinc-500">{t.subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setRootTab('board')} className={`btn-ghost h-10 px-3 ${rootTab === 'board' ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100' : ''}`}><BriefcaseBusiness size={15} />{t.board}</button>
            <button type="button" onClick={() => setRootTab('escrows')} className={`btn-ghost h-10 px-3 ${rootTab === 'escrows' ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100' : ''}`}><WalletCards size={15} />{t.mine}</button>
            <button type="button" onClick={() => { void refreshCore(); void refreshConversation(); }} className="btn-ghost h-10 w-10" aria-label={t.refresh}><RefreshCw size={15} className={busy ? 'animate-spin' : ''} /></button>
          </div>
        </div>
        {!configured ? <Notice tone="warning" icon={<AlertTriangle size={16} />}>{t.contractMissing}</Notice> : null}
        {dataError ? <Notice tone="warning" icon={<AlertTriangle size={16} />}>{dataError}</Notice> : null}
        {flowError ? <Notice tone="danger" icon={<AlertTriangle size={16} />}>{flowError}</Notice> : null}
        {status ? <Notice tone="success" icon={busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}>{status}{txUrl ? <a href={txUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 underline">{t.explorer}<ExternalLink size={12} /></a> : null}</Notice> : null}
      </div>

      {rootTab === 'board' ? (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2 lg:hidden">
            {(['gigs', 'chat', 'escrow'] as MobilePane[]).map((pane) => <button key={pane} type="button" onClick={() => setMobilePane(pane)} className={`btn-ghost h-9 px-2 text-xs ${mobilePane === pane ? 'border-emerald-400/40 bg-emerald-400/10' : ''}`}>{pane === 'gigs' ? t.board : pane === 'chat' ? t.chat : t.escrow}</button>)}
          </div>
          <div className="grid min-w-0 gap-4 lg:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)_320px]">
            <div className={`${mobilePane === 'gigs' ? 'block' : 'hidden'} lg:block`}>
              <GigBoardPanel t={t} gigs={filteredGigs} selectedGigId={selectedGigId} search={search} typeFilter={typeFilter} categoryFilter={categoryFilter} onSearch={setSearch} onType={setTypeFilter} onCategory={setCategoryFilter} onSelect={(gig) => { setSelectedGigId(gig.id); setMobilePane('chat'); }} onCreate={() => setCreateOpen(true)} canCreate={isConnected && correctChain && configured} />
            </div>
            <div className={`${mobilePane === 'chat' ? 'block' : 'hidden'} min-w-0 lg:block`}>
              <ConversationPanel t={t} language={language} address={address} gig={selectedGig} conversation={selectedConversation} options={conversationOptions} messages={messages} proposals={proposals} initialMessage={initialMessage} composer={composer} busy={busy || walletPending} onConversation={setSelectedConversationId} onInitial={setInitialMessage} onStart={startConversation} onComposer={setComposer} onSend={sendMessage} onPropose={() => setProposalOpen(true)} onProposalAction={(proposal, action) => void proposalAction(proposal, action)} />
            </div>
            <div className={`${mobilePane === 'escrow' ? 'block' : 'hidden'} lg:col-span-2 lg:block 2xl:col-span-1`}>
              <EscrowCard t={t} language={language} address={address} escrow={selectedEscrow} evidence={selectedEvidence} activity={activity} onRelease={() => void escrowAction('release')} onRefund={() => void escrowAction('refund')} onDispute={() => setDisputeMode('open')} onEvidence={() => setDisputeMode('evidence')} onResolve={(mode) => setResolutionMode(mode)} />
            </div>
          </div>
          {selectedEscrow && mobilePane !== 'escrow' ? <button type="button" onClick={() => setMobilePane('escrow')} className="mobile-escrow-summary fixed bottom-4 left-4 right-4 z-30 flex items-center justify-between rounded-lg border px-4 py-3 lg:hidden"><span className="text-sm font-semibold text-white">Escrow #{selectedEscrow.id.toString()}</span><StatusBadge status={selectedEscrow.status} /></button> : null}
        </>
      ) : (
        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <MyEscrowsPanel t={t} language={language} items={filteredEscrows} filter={escrowFilter} selected={selectedEscrowId} onFilter={setEscrowFilter} onSelect={(id) => setSelectedEscrowId(id)} />
          <EscrowCard t={t} language={language} address={address} escrow={selectedEscrow} evidence={selectedEvidence} activity={activity} onRelease={() => void escrowAction('release')} onRefund={() => void escrowAction('refund')} onDispute={() => setDisputeMode('open')} onEvidence={() => setDisputeMode('evidence')} onResolve={(mode) => setResolutionMode(mode)} />
        </div>
      )}

      {createOpen ? <CreateGigModal t={t} pending={busy || walletPending} onClose={() => setCreateOpen(false)} onSubmit={(input) => void createGig(input)} /> : null}
      {proposalOpen ? <ProposalModal t={t} pending={busy || walletPending} onClose={() => setProposalOpen(false)} onSubmit={(input) => void proposeTerms(input)} /> : null}
      {disputeMode ? <EvidenceModal t={t} pending={busy || walletPending} title={disputeMode === 'open' ? t.dispute : t.evidence} onClose={() => setDisputeMode(null)} onSubmit={(input) => void submitEvidence(input)} /> : null}
      {resolutionMode ? <EvidenceModal t={t} pending={busy || walletPending} title={t.resolutionTitle} onClose={() => setResolutionMode(null)} onSubmit={(input) => void resolveDispute(input)} /> : null}
    </section>
  );
}

function GigBoardPanel({ t, gigs, selectedGigId, search, typeFilter, categoryFilter, canCreate, onSearch, onType, onCategory, onSelect, onCreate }: { t: typeof text.en | typeof text.tr; gigs: GigRecord[]; selectedGigId: bigint | null; search: string; typeFilter: 'all' | ListingType; categoryFilter: 'all' | GigCategory; canCreate: boolean; onSearch: (value: string) => void; onType: (value: 'all' | ListingType) => void; onCategory: (value: 'all' | GigCategory) => void; onSelect: (gig: GigRecord) => void; onCreate: () => void }) {
  return <div className="panel min-h-[680px] p-3">
    <div className="flex items-center justify-between gap-2"><div><p className="eyebrow">Marketplace</p><h2 className="panel-title">{t.board}</h2></div><button type="button" onClick={onCreate} disabled={!canCreate} className="btn-primary h-9 w-9" aria-label={t.newGig}><Plus size={17} /></button></div>
    <label className="relative mt-4 block"><Search size={15} className="absolute left-3 top-3.5 text-zinc-600" /><input value={search} onChange={(event) => onSearch(event.target.value)} className="input pl-9" placeholder={t.search} /></label>
    <div className="mt-2 grid gap-2"><label className="relative"><Filter size={14} className="absolute left-3 top-3.5 text-zinc-600" /><select value={typeFilter} onChange={(event) => onType(event.target.value === 'all' ? 'all' : Number(event.target.value) as ListingType)} className="input pl-9"><option value="all">{t.allTypes}</option><option value="0">{t.workRequest}</option><option value="1">{t.serviceOffer}</option></select></label><select value={categoryFilter} onChange={(event) => onCategory(event.target.value === 'all' ? 'all' : Number(event.target.value) as GigCategory)} className="input"><option value="all">{t.allCategories}</option>{categoryLabels.map((label, index) => <option key={label} value={index}>{label}</option>)}</select></div>
    <div className="mt-3 grid max-h-[500px] gap-2 overflow-y-auto pr-1">{gigs.length === 0 ? <Empty text={t.noGigs} /> : gigs.map((gig) => <button type="button" key={gig.id.toString()} onClick={() => onSelect(gig)} className={`chat-card p-3 text-left ${gig.id === selectedGigId ? 'border-emerald-400/40 bg-emerald-400/10' : ''}`}><div className="flex items-center justify-between gap-2"><Badge>{gig.listingType === 0 ? t.workRequest : t.serviceOffer}</Badge><span className="text-[11px] text-zinc-500">#{gig.id.toString()}</span></div><h3 className="mt-2 text-sm font-semibold text-zinc-100">{gig.title}</h3><p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{gig.description}</p><div className="mt-3 flex items-center justify-between text-xs"><span className="text-zinc-500">{categoryLabels[gig.category]}</span><span className="font-mono text-emerald-200">{formatEther(gig.suggestedBudget)} USDC</span></div></button>)}</div>
  </div>;
}

function ConversationPanel({ t, language, address, gig, conversation, options, messages, proposals, initialMessage, composer, busy, onConversation, onInitial, onStart, onComposer, onSend, onPropose, onProposalAction }: { t: typeof text.en | typeof text.tr; language: Language; address?: `0x${string}`; gig?: GigRecord; conversation?: EscrowConversation; options: EscrowConversation[]; messages: EscrowChatMessage[]; proposals: EscrowProposal[]; initialMessage: string; composer: string; busy: boolean; onConversation: (id: bigint) => void; onInitial: (value: string) => void; onStart: (event: FormEvent<HTMLFormElement>) => void; onComposer: (value: string) => void; onSend: (event: FormEvent<HTMLFormElement>) => void; onPropose: () => void; onProposalAction: (proposal: EscrowProposal, action: 'accept' | 'withdraw' | 'fund') => void }) {
  if (!gig) return <div className="panel min-h-[680px]"><Empty text={t.chooseGig} /></div>;
  const isCreator = same(address, gig.creator);
  return <div className="panel flex min-h-[680px] min-w-0 flex-col">
    <div className="panel-header"><div><p className="eyebrow">{t.chat}</p><h2 className="panel-title">{gig.title}</h2><div className="mt-2 flex items-center gap-2 text-xs text-zinc-500"><span>{short(gig.creator)}</span><AgentBadge address={gig.creator} label={t.roleAgent} /></div></div>{options.length > 1 ? <select value={conversation?.id.toString() ?? ''} onChange={(event) => onConversation(BigInt(event.target.value))} className="input max-w-56"><option value="">{t.responses}</option>{options.map((item) => <option key={item.id.toString()} value={item.id.toString()}>{short(item.counterparty)}</option>)}</select> : null}</div>
    {!conversation ? isCreator ? <div className="mt-5"><Empty text={t.responses} /></div> : <form onSubmit={onStart} className="mt-5 grid gap-3"><textarea value={initialMessage} onChange={(event) => onInitial(event.target.value)} className="input min-h-32 py-3" placeholder={t.initial} maxLength={1500} required /><button type="submit" disabled={busy || !initialMessage.trim()} className="btn-primary h-11"><LockKeyhole size={16} />{t.start}</button></form> : <>
      <div className="mt-4 flex-1 space-y-3 overflow-y-auto rounded-lg border border-zinc-800 bg-black/20 p-3">{messages.map((message) => <MessageBubble key={message.id.toString()} t={t} language={language} message={message} conversation={conversation} gig={gig} viewer={address} proposal={message.kind === 1 ? proposals.find((item) => item.id === message.proposalId) : undefined} onProposalAction={onProposalAction} />)}{messages.length === 0 ? <Empty text={t.encrypted} /> : null}</div>
      <form onSubmit={onSend} className="mt-3 grid gap-2"><textarea value={composer} onChange={(event) => onComposer(event.target.value)} className="input min-h-24 py-3" placeholder={t.message} maxLength={1500} /><div className="flex flex-col gap-2 sm:flex-row sm:justify-between"><button type="button" onClick={onPropose} disabled={busy || gig.status !== 0} className="btn-ghost h-10 px-3"><FileCheck2 size={15} />{t.propose}</button><button type="submit" disabled={busy || !composer.trim()} className="btn-primary h-10 px-4"><Send size={15} />{t.send}</button></div></form>
    </>}
  </div>;
}

function MessageBubble({ t, language, message, conversation, gig, viewer, proposal, onProposalAction }: { t: typeof text.en | typeof text.tr; language: Language; message: EscrowChatMessage; conversation: EscrowConversation; gig: GigRecord; viewer?: `0x${string}`; proposal?: EscrowProposal; onProposalAction: (proposal: EscrowProposal, action: 'accept' | 'withdraw' | 'fund') => void }) {
  const outgoing = same(viewer, message.sender);
  return <article className={`message-bubble max-w-[92%] rounded-lg border p-3 ${outgoing ? 'message-bubble-outgoing ml-auto border-emerald-400/25 bg-emerald-400/10' : 'border-zinc-800 bg-zinc-950'}`}><EncryptedText t={t} message={message} conversation={conversation} gig={gig} viewer={viewer} />{proposal ? <ProposalCard t={t} address={viewer} proposal={proposal} onAction={onProposalAction} /> : null}<div className="mt-2 text-right text-[11px] text-zinc-500">{date(message.timestamp, language)}</div></article>;
}

function EncryptedText({ t, message, conversation, gig, viewer }: { t: typeof text.en | typeof text.tr; message: EscrowChatMessage; conversation: EscrowConversation; gig: GigRecord; viewer?: `0x${string}` }) {
  const [plain, setPlain] = useState('');
  const [failed, setFailed] = useState(false);
  const recipient = same(message.sender, conversation.creator) ? conversation.counterparty : conversation.creator;
  const contextId = conversationContext(gig, conversation.counterparty);
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!viewer) return;
      const expected: EscrowChatCryptoContext = { chainId: arcNetworkTestnet.id, contractAddress: arcanumGigBoardAddress, conversationId: contextId, senderAddress: message.sender, recipientAddress: recipient };
      try {
        const value = await decryptEscrowChatMessage(message.payload, viewer, expected);
        if (!cancelled) { setPlain(value); setFailed(false); }
      } catch { if (!cancelled) { setPlain(''); setFailed(true); } }
    }
    void run();
    return () => { cancelled = true; };
  }, [contextId, message.payload, message.sender, recipient, viewer]);
  return <div><p className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-100">{plain || t.encrypted}</p>{failed ? <p className="mt-2 text-xs text-amber-200">{t.decryptFailed}</p> : null}</div>;
}

function ProposalCard({ t, address, proposal, onAction }: { t: typeof text.en | typeof text.tr; address?: `0x${string}`; proposal: EscrowProposal; onAction: (proposal: EscrowProposal, action: 'accept' | 'withdraw' | 'fund') => void }) {
  const participant = same(address, proposal.payer) || same(address, proposal.provider);
  return <div className="mt-3 rounded-md border border-sky-300/20 bg-sky-300/5 p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-sky-200">{t.proposal} #{proposal.id.toString()}</span><Badge>{proposalStatusLabels[proposal.status]}</Badge></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-500"><Metric label={t.amount} value={`${formatEther(proposal.amount)} USDC`} /><Metric label={t.timeout} value={`${proposal.timeoutDays} days`} /><Metric label={t.payer} value={short(proposal.payer)} /><Metric label={t.provider} value={short(proposal.provider)} /></div><div className="mt-3 flex flex-wrap gap-2">{proposal.status === 0 && !same(address, proposal.proposer) ? <button type="button" onClick={() => onAction(proposal, 'accept')} className="btn-primary h-8 px-3 text-xs">{t.accept}</button> : null}{participant && (proposal.status === 0 || proposal.status === 1) ? <button type="button" onClick={() => onAction(proposal, 'withdraw')} className="btn-ghost h-8 px-3 text-xs">{t.withdraw}</button> : null}{proposal.status === 1 && same(address, proposal.payer) ? <button type="button" onClick={() => onAction(proposal, 'fund')} className="btn-primary h-8 px-3 text-xs"><LockKeyhole size={13} />{t.fund}</button> : null}</div></div>;
}

function EscrowCard({ t, language, address, escrow, evidence, activity, onRelease, onRefund, onDispute, onEvidence, onResolve }: { t: typeof text.en | typeof text.tr; language: Language; address?: `0x${string}`; escrow?: EscrowRecord; evidence: EscrowEvidence[]; activity: ActivityItem[]; onRelease: () => void; onRefund: () => void; onDispute: () => void; onEvidence: () => void; onResolve: (mode: 'provider' | 'payer') => void }) {
  if (!escrow) return <aside className="panel min-h-[360px]"><p className="eyebrow">Protection</p><h2 className="panel-title">{t.escrow}</h2><div className="mt-4"><Empty text={t.selectEscrow} /></div></aside>;
  const overdue = escrow.status === 0 && Date.now() >= Number(escrow.deadline) * 1000;
  const party = same(address, escrow.payer) || same(address, escrow.provider);
  return <aside className="panel min-h-[480px] 2xl:sticky 2xl:top-4"><div className="flex items-center justify-between"><div><p className="eyebrow">Protection</p><h2 className="panel-title">Escrow #{escrow.id.toString()}</h2></div><StatusBadge status={escrow.status} /></div><div className="mt-4 grid gap-2"><Metric label={t.amount} value={`${formatEther(escrow.amount)} USDC`} /><Metric label={t.payer} value={short(escrow.payer)} /><Metric label={t.provider} value={short(escrow.provider)} /><Metric label={t.arbiter} value={short(escrow.arbiter)} /><Metric label={t.deadline} value={date(escrow.deadline, language)} /></div>{overdue ? <Notice tone="warning" icon={<Clock3 size={15} />}>{t.overdue}</Notice> : null}<div className="mt-4 grid gap-2">{escrow.status === 0 && same(address, escrow.payer) ? <button type="button" onClick={onRelease} className="btn-primary h-10"><Check size={15} />{t.release}</button> : null}{escrow.status === 0 && same(address, escrow.provider) ? <button type="button" onClick={onRefund} className="btn-ghost h-10"><Undo2 size={15} />{t.refund}</button> : null}{escrow.status === 0 && party ? <button type="button" onClick={onDispute} className="btn-ghost h-10 border-amber-300/30 text-amber-200"><Gavel size={15} />{t.dispute}</button> : null}{escrow.status === 3 && party ? <button type="button" onClick={onEvidence} className="btn-ghost h-10"><FileCheck2 size={15} />{t.evidence}</button> : null}{escrow.status === 3 && same(address, escrow.arbiter) ? <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => onResolve('provider')} className="btn-primary h-10 px-2 text-xs">{t.resolveProvider}</button><button type="button" onClick={() => onResolve('payer')} className="btn-ghost h-10 px-2 text-xs">{t.resolvePayer}</button></div> : null}</div>{evidence.length > 0 ? <div className="mt-5"><p className="eyebrow">Evidence</p><div className="mt-2 grid gap-2">{evidence.map((item) => <a key={item.id.toString()} href={item.evidenceURI} target="_blank" rel="noreferrer" className="chat-card flex items-center justify-between p-2 text-xs text-zinc-400"><span>#{item.id.toString()} · {short(item.author)}</span><ExternalLink size={12} /></a>)}</div></div> : null}<div className="mt-5"><p className="eyebrow">{t.activity}</p><div className="mt-2 grid gap-2">{activity.length === 0 ? <p className="text-xs text-zinc-600">{t.noActivity}</p> : activity.slice(0, 8).map((item) => <a key={item.key} href={transactionUrl(item.hash)} target="_blank" rel="noreferrer" className="flex items-center justify-between text-xs text-zinc-400 hover:text-white"><span>{item.label}</span><ExternalLink size={12} /></a>)}</div></div></aside>;
}

function MyEscrowsPanel({ t, language, items, filter, selected, onFilter, onSelect }: { t: typeof text.en | typeof text.tr; language: Language; items: EscrowRecord[]; filter: EscrowFilter; selected: bigint | null; onFilter: (filter: EscrowFilter) => void; onSelect: (id: bigint) => void }) {
  return <div className="panel min-h-[620px]"><div className="panel-header"><div><p className="eyebrow">Portfolio</p><h2 className="panel-title">{t.mine}</h2></div><div className="grid grid-cols-2 rounded-lg border border-zinc-800 bg-zinc-950 p-1"><button type="button" onClick={() => onFilter('active')} className={`btn-subtle h-9 px-3 ${filter === 'active' ? 'bg-white text-zinc-950' : ''}`}>{t.active}</button><button type="button" onClick={() => onFilter('history')} className={`btn-subtle h-9 px-3 ${filter === 'history' ? 'bg-white text-zinc-950' : ''}`}>{t.history}</button></div></div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{items.length === 0 ? <Empty text={t.noEscrows} /> : items.map((item) => <button type="button" key={item.id.toString()} onClick={() => onSelect(item.id)} className={`chat-card p-4 text-left ${item.id === selected ? 'border-emerald-400/40' : ''}`}><div className="flex items-center justify-between"><span className="font-mono text-xs text-zinc-500">#{item.id.toString()}</span><StatusBadge status={item.status} /></div><p className="mt-3 text-lg font-semibold text-white">{formatEther(item.amount)} USDC</p><div className="mt-3 grid gap-1 text-xs text-zinc-500"><span>{t.payer}: {short(item.payer)}</span><span>{t.provider}: {short(item.provider)}</span><span>{t.deadline}: {date(item.deadline, language)}</span></div></button>)}</div></div>;
}

function CreateGigModal({ t, pending, onClose, onSubmit }: { t: typeof text.en | typeof text.tr; pending: boolean; onClose: () => void; onSubmit: (input: { listingType: ListingType; category: GigCategory; title: string; description: string; budget: string }) => void }) {
  const [listingType, setListingType] = useState<ListingType>(0); const [category, setCategory] = useState<GigCategory>(0); const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [budget, setBudget] = useState('');
  return <Modal title={t.createTitle} onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); onSubmit({ listingType, category, title, description, budget }); }} className="mt-5 grid gap-3"><Field label={t.listingType}><select value={listingType} onChange={(event) => setListingType(Number(event.target.value) as ListingType)} className="input"><option value={0}>{t.workRequest}</option><option value={1}>{t.serviceOffer}</option></select></Field><Field label={t.category}><select value={category} onChange={(event) => setCategory(Number(event.target.value) as GigCategory)} className="input">{categoryLabels.map((label, index) => <option value={index} key={label}>{label}</option>)}</select></Field><Field label={t.titleField}><input value={title} onChange={(event) => setTitle(event.target.value)} className="input" maxLength={120} required /></Field><Field label={t.description}><textarea value={description} onChange={(event) => setDescription(event.target.value)} className="input min-h-28 py-3" maxLength={2000} required /></Field><Field label={t.amount}><input value={budget} onChange={(event) => setBudget(event.target.value)} className="input" inputMode="decimal" placeholder="25" required /></Field><ModalActions t={t} pending={pending} onClose={onClose} /></form></Modal>;
}

function ProposalModal({ t, pending, onClose, onSubmit }: { t: typeof text.en | typeof text.tr; pending: boolean; onClose: () => void; onSubmit: (input: { amount: string; timeout: 7 | 14; arbiter: `0x${string}`; terms: string }) => void }) {
  const [amount, setAmount] = useState(''); const [timeout, setTimeoutDays] = useState<7 | 14>(7); const [arbiter, setArbiter] = useState(''); const [terms, setTerms] = useState(''); const valid = isAddress(arbiter);
  return <Modal title={t.proposeTitle} onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); if (valid) onSubmit({ amount, timeout, arbiter: arbiter as `0x${string}`, terms }); }} className="mt-5 grid gap-3"><Field label={t.amount}><input value={amount} onChange={(event) => setAmount(event.target.value)} className="input" inputMode="decimal" required /></Field><Field label={t.timeout}><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setTimeoutDays(7)} className={`btn-ghost h-10 ${timeout === 7 ? 'border-emerald-400/40' : ''}`}>{t.days7}</button><button type="button" onClick={() => setTimeoutDays(14)} className={`btn-ghost h-10 ${timeout === 14 ? 'border-emerald-400/40' : ''}`}>{t.days14}</button></div></Field><Field label={t.arbiter}><input value={arbiter} onChange={(event) => setArbiter(event.target.value)} className="input font-mono" placeholder="0x..." required /></Field><Field label={t.terms}><textarea value={terms} onChange={(event) => setTerms(event.target.value)} className="input min-h-32 py-3" maxLength={1500} required /></Field><ModalActions t={t} pending={pending || !valid} onClose={onClose} /></form></Modal>;
}

function EvidenceModal({ t, pending, title, onClose, onSubmit }: { t: typeof text.en | typeof text.tr; pending: boolean; title: string; onClose: () => void; onSubmit: (input: { hash: `0x${string}`; uri: string }) => void }) {
  const [hash, setHash] = useState(''); const [uri, setUri] = useState(''); const valid = isHex(hash) && hash.length === 66 && uri.trim().length > 0;
  return <Modal title={title} onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); if (valid) onSubmit({ hash: hash as `0x${string}`, uri }); }} className="mt-5 grid gap-3"><Field label={t.evidenceHash}><input value={hash} onChange={(event) => setHash(event.target.value)} className="input font-mono" placeholder="0x..." required /></Field><Field label={t.evidenceUri}><input value={uri} onChange={(event) => setUri(event.target.value)} className="input" placeholder="ipfs://..." required /></Field><ModalActions t={t} pending={pending || !valid} onClose={onClose} /></form></Modal>;
}

function AgentBadge({ address, label }: { address: `0x${string}`; label: string }) {
  const { data } = useReadContract({ address: arcanumAgentsAddress, abi: arcanumAgentsAbi, functionName: 'isActiveAgent', args: [address], query: { enabled: isArcanumAgentsConfigured } });
  return data ? <Badge><Bot size={11} />{label}</Badge> : null;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}><div className="modal-panel max-h-[90vh] overflow-y-auto"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><ShieldCheck size={18} className="text-emerald-300" /><h2 className="text-lg font-semibold text-white">{title}</h2></div><button type="button" onClick={onClose} className="btn-ghost h-9 w-9" aria-label="Close"><X size={16} /></button></div>{children}</div></div>; }
function ModalActions({ t, pending, onClose }: { t: typeof text.en | typeof text.tr; pending: boolean; onClose: () => void }) { return <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="btn-ghost h-10 px-4">{t.cancel}</button><button type="submit" disabled={pending} className="btn-primary h-10 px-4">{pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}{t.submit}</button></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-2"><span className="text-xs font-medium text-zinc-500">{label}</span>{children}</label>; }
function Empty({ text: value }: { text: string }) { return <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950/50 p-4 text-sm leading-6 text-zinc-500">{value}</div>; }
function Badge({ children }: { children: ReactNode }) { return <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] font-medium text-zinc-300">{children}</span>; }
function StatusBadge({ status }: { status: number }) { const styles = status === 0 ? 'border-amber-300/25 bg-amber-300/10 text-amber-200' : status === 1 ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' : status === 2 ? 'border-sky-300/25 bg-sky-300/10 text-sky-200' : 'border-red-400/25 bg-red-400/10 text-red-200'; return <span className={`status-badge rounded-full border px-2.5 py-1 text-xs font-medium ${styles}`}>{statusLabels[status]}</span>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-md border border-zinc-800 bg-black/30 px-3 py-2"><p className="text-[11px] text-zinc-600">{label}</p><p className="mt-1 truncate font-mono text-xs text-zinc-200">{value}</p></div>; }
function Notice({ tone, icon, children }: { tone: 'warning' | 'danger' | 'success'; icon: ReactNode; children: ReactNode }) { const style = tone === 'warning' ? 'border-amber-300/25 bg-amber-300/10 text-amber-200' : tone === 'danger' ? 'border-red-400/25 bg-red-400/10 text-red-200' : 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'; return <div className={`mt-4 flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${style}`}>{icon}<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 break-words">{children}</div></div>; }
