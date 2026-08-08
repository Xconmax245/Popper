import { Header } from '@/components/landing/Header';
import { Hero } from '@/components/landing/Hero';
import { TickerStrip } from '@/components/landing/TickerStrip';
import { DemoStrip } from '@/components/landing/DemoStrip';
import { DarkFeatureBlock } from '@/components/landing/DarkFeatureBlock';
import { FeatureGrid } from '@/components/landing/FeatureGrid';
import { StatsCallout } from '@/components/landing/StatsCallout';
import { FaqAccordion } from '@/components/landing/FaqAccordion';
import { Footer } from '@/components/landing/Footer';
import { Divider } from '@/components/landing/Cinematic';

import { createClient } from '@/lib/supabase/server';

export const revalidate = 60; // Cache the landing page for 60 seconds

export const metadata = {
  title: 'Popper — Adversarial Claim Verification for Research Papers',
  description: 'Popper uses adversarial multi-agent AI to extract factual claims from research papers, verify them against real citation sources, and synthesize hypotheses only from what survives. Built for the IIT Madras Research Agents Hack.',
  openGraph: {
    title: 'Popper — No claim survives without a fight.',
    description: 'Adversarial multi-agent claim verification. Every verdict cites evidence. Every refusal is logged.',
    type: 'website',
  },
};

export default async function HomePage() {
  const supabase = await createClient();

  // Fetch real stats
  const { count: runCount } = await supabase
    .from('runs')
    .select('*', { count: 'exact', head: true })
    .eq('state', 'done');

  const { count: claimCount } = await supabase
    .from('claims')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'confirmed');

  const stats = [
    { num: `${runCount ?? 0}`, label: 'SUCCESSFUL RUNS' },
    { num: `${claimCount ?? 0}`, label: 'CLAIMS CONFIRMED' },
    { num: '0', label: 'UNSOURCED CLAIMS KEPT' },
  ];

  return (
    <>
      <Header />
      <main>
        <Hero />
        <TickerStrip />
        <DemoStrip />
        <Divider />
        <DarkFeatureBlock />
        <FeatureGrid />
        <Divider />
        <StatsCallout stats={stats} />
        <FaqAccordion />
      </main>
      <Footer />
    </>
  );
}
