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
  let runCount = 0;
  let claimCount = 0;

  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = await createClient();

      // Fetch real stats
      const { count: rc } = await supabase
        .from('runs')
        .select('*', { count: 'exact', head: true })
        .eq('state', 'done');
      
      if (rc !== null) runCount = rc;

      const { count: cc } = await supabase
        .from('claims')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'confirmed');
        
      if (cc !== null) claimCount = cc;
    } catch (e) {
      console.warn("Could not fetch stats during build", e);
    }
  }

  const stats = [
    { num: `${runCount}`, label: 'SUCCESSFUL RUNS' },
    { num: `${claimCount}`, label: 'CLAIMS CONFIRMED' },
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
