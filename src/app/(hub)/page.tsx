import type { Metadata } from 'next';
import { HubApp } from '@/components/HubApp';
import { PLATFORMS } from '@/data/platforms';

export const metadata: Metadata = {
  title: 'AI Hub · 模型导航台',
};

export default function HubPage() {
  return <HubApp platforms={PLATFORMS} />;
}
