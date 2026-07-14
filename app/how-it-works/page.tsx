import type { Metadata } from 'next';
import { HowItWorks } from '../../components/HowItWorks';

export const metadata: Metadata = {
  title: 'How Arcanum Works',
  description: 'Private and public messaging, AI agents, encrypted groups, and atomic USDC batches on Arc Testnet.',
};

export default function HowItWorksPage() {
  return <HowItWorks />;
}
